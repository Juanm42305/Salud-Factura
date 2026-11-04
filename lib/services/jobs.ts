// Cola de trabajos en PostgreSQL (tabla jobs). Sin infraestructura extra.
// La procesan: el worker (Railway/Render, RUN_WORKER=true), el webhook con after() y /api/cron/tick.
import { db, type Consultor } from '../db'
import { ErrorNoReintentable } from '../errores'
import { log } from '../logger'
import { emitirSsRecaudo } from './facturas'

const MAX_INTENTOS = 5

/** Encola una sola vez por (tipo, clave): un webhook repetido no duplica la factura. */
export async function encolar(c: Consultor, tipo: string, clave: string, payload: Record<string, unknown>) {
  await c.q(
    `insert into jobs (tipo, clave, payload) values ($1, $2, $3)
     on conflict (tipo, clave) do nothing`,
    [tipo, clave, JSON.stringify(payload)],
  )
}

async function ejecutar(job: { tipo: string; payload: any }) {
  switch (job.tipo) {
    case 'emitir_ss_recaudo':
      return emitirSsRecaudo(String(job.payload.reference_code))
    default:
      throw new ErrorNoReintentable(`Tipo de trabajo desconocido: ${job.tipo}`)
  }
}

/** Procesa hasta `max` trabajos pendientes. Devuelve cuántos tomó. */
export async function procesarJobs(max = 5): Promise<number> {
  // Trabajos que quedaron "procesando" por una caída del proceso vuelven a la cola
  await db.q(
    `update jobs set estado = 'pendiente', updated_at = now()
     where estado = 'procesando' and updated_at < now() - interval '3 minutes'`,
  )
  let tomados = 0
  while (tomados < max) {
    const job = await db.q1<{ id: number; tipo: string; clave: string; payload: any; intentos: number }>(
      `update jobs set estado = 'procesando', intentos = intentos + 1, updated_at = now()
       where id = (
         select id from jobs where estado = 'pendiente' and proximo_intento <= now()
         order by id limit 1 for update skip locked)
       returning id, tipo, clave, payload, intentos`,
    )
    if (!job) break
    tomados++
    try {
      await ejecutar(job)
      await db.q(`update jobs set estado = 'hecho', ultimo_error = null, updated_at = now() where id = $1`, [job.id])
      log.info('job.hecho', { id: job.id, tipo: job.tipo, clave: job.clave })
    } catch (e) {
      const definitivo = e instanceof ErrorNoReintentable || job.intentos >= MAX_INTENTOS
      const espera = 10 * 2 ** (job.intentos - 1)
      await db.q(
        `update jobs set estado = $2, ultimo_error = $3,
           proximo_intento = now() + ($4::int * interval '1 second'), updated_at = now()
         where id = $1`,
        [job.id, definitivo ? 'error' : 'pendiente', String((e as Error).message).slice(0, 1000), espera],
      )
      log.error('job.fallo', { id: job.id, tipo: job.tipo, clave: job.clave, definitivo, error: e as Error })
    }
  }
  return tomados
}

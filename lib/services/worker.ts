// Worker en el mismo proceso (Railway/Render con RUN_WORKER=true): cola cada 5 s y polling cada 30 s.
// En Vercel no hay proceso persistente: el webhook usa after(), la pantalla de caja reconcilia al consultar
// y /api/cron/tick se puede llamar desde un cron externo.
import { log } from '../logger'
import { reconciliarPendientes } from './cobros'
import { procesarJobs } from './jobs'

const g = globalThis as unknown as { __sfWorker?: boolean }
let ocupadoCola = false
let ocupadoPolling = false

async function cola() {
  if (ocupadoCola) return
  ocupadoCola = true
  try {
    await procesarJobs(10)
  } catch (e) {
    log.error('worker.cola', { error: e as Error })
  } finally {
    ocupadoCola = false
  }
}

async function polling() {
  if (ocupadoPolling) return
  ocupadoPolling = true
  try {
    const r = await reconciliarPendientes()
    if (Object.keys(r).length) log.info('worker.polling', { resultados: r })
    await cola()
  } catch (e) {
    log.error('worker.polling', { error: e as Error })
  } finally {
    ocupadoPolling = false
  }
}

/** Una pasada completa: la usa /api/cron/tick. */
export async function tick() {
  const conciliados = await reconciliarPendientes()
  const trabajos = await procesarJobs(10)
  return { conciliados, trabajos }
}

export function iniciarWorker() {
  if (g.__sfWorker) return
  g.__sfWorker = true
  setInterval(cola, 5_000)
  setInterval(polling, 30_000)
  log.info('worker.iniciado', { cola_s: 5, polling_s: 30 })
}

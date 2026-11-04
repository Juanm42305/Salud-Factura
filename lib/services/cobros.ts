// Parte 1 · Cobro del copago con Factus Pay: crear recaudo (QR), confirmar el pago y polling de respaldo.
import { db } from '../db'
import { ErrorNegocio, ErrorValidacion } from '../errores'
import { pay } from '../factus'
import type { RecaudoPay } from '../factus/payClient'
import { log } from '../logger'
import { validar } from '../validation'
import { registrarValidacion } from './bitacoraValidacion'
import { encolar } from './jobs'
import { parsearFechaFactus, referenciaRecaudo } from './referencias'

export const EXPIRACION_QR_SEG = 900 // 15 minutos en caja

const ESTADOS_RECAUDO = ['creado', 'ready', 'started', 'paid', 'rejected', 'failed', 'revision']
const estadoValido = (s: string) => (ESTADOS_RECAUDO.includes(s) ? s : 'ready')

const ESTADOS_YA_PAGADA = ['pagada', 'copago_facturado', 'atencion_cerrada', 'facturada_eps', 'glosada', 'pagada_eps']

function enmascararPagador(p: RecaudoPay['payer']) {
  if (!p) return null
  const num = String(p.document_number ?? '')
  return {
    name: p.name ?? null,
    document_type: p.document_type ?? null,
    document_number: num ? `****${num.slice(-4)}` : null,
  }
}

/** Crea (o regenera) el QR del copago de una admisión. Idempotente por reference_code. */
export async function crearCobro(admisionId: number) {
  const a = await db.q1(
    `select id, codigo, estado, concepto_recaudo, monto_recaudo from admisiones where id = $1`,
    [admisionId],
  )
  if (!a) throw new ErrorNegocio(404, 'Admisión no encontrada')
  if (ESTADOS_YA_PAGADA.includes(a.estado)) throw new ErrorNegocio(409, `La admisión ya tiene el pago confirmado (${a.estado})`)

  const previo = await db.q1(
    `select reference_code, estado, intento from recaudos where admision_id = $1 order by intento desc limit 1`,
    [admisionId],
  )
  let intento = 1
  if (previo) {
    if (previo.estado === 'paid') throw new ErrorNegocio(409, 'El recaudo ya está pagado')
    // Pago rechazado o fallido: nueva referencia. QR vencido o pendiente: misma referencia, nuevo expiration
    intento = ['rejected', 'failed', 'revision'].includes(previo.estado) ? previo.intento + 1 : previo.intento
  }
  const referencia = referenciaRecaudo(a.codigo, a.concepto_recaudo, intento)
  const monto = Number(a.monto_recaudo)

  const duplicada = await db.q1(
    `select 1 as x from recaudos where reference_code = $1 and (admision_id <> $2 or monto <> $3)`,
    [referencia, admisionId, monto],
  )
  const v = validar({ reference_code: referencia, amount: String(monto) }, { tipo: 'recaudoPay', referenciaDuplicada: !!duplicada })
  await registrarValidacion({ tipo: 'recaudoPay', referencia, admisionId, resultado: v, valor: monto })
  if (!v.ok) throw new ErrorValidacion(v.hallazgos)

  await db.q(
    `insert into recaudos (reference_code, admision_id, concepto, intento, monto)
     values ($1, $2, $3, $4, $5) on conflict (reference_code) do nothing`,
    [referencia, admisionId, a.concepto_recaudo, intento, monto],
  )

  const { recaudo, existente } = await pay().crearRecaudo(referencia, monto, EXPIRACION_QR_SEG)
  const expira = parsearFechaFactus(recaudo.qr_expires_at) ?? new Date(Date.now() + EXPIRACION_QR_SEG * 1000)
  const estado = estadoValido(recaudo.status)

  await db.q(
    `update recaudos set estado = $2, breb_key = coalesce($3, breb_key), qr = coalesce($4, qr), qr_expira = $5,
       ultima_consulta = now(), updated_at = now()
     where reference_code = $1 and estado <> 'paid'`,
    [referencia, estado === 'paid' ? 'ready' : estado, recaudo.breb_key ?? null, recaudo.qr ?? null, expira.toISOString()],
  )

  if (estado === 'paid') {
    await confirmarPago(referencia, recaudo.amount, 'polling', recaudo.payer)
  } else {
    await db.q(
      `update admisiones set estado = 'cobro_pendiente', nota_estado = null, updated_at = now()
       where id = $1 and estado in ('creada', 'cobro_pendiente', 'cobro_vencido', 'cobro_fallido')`,
      [admisionId],
    )
  }
  log.info('cobro.creado', { referencia, monto, existente, estado })
  return {
    reference_code: referencia,
    estado,
    monto,
    qr: recaudo.qr ?? null,
    breb_key: recaudo.breb_key ?? null,
    qr_expira: expira.toISOString(),
    existente,
  }
}

export type ResultadoConfirmacion = 'pagado' | 'duplicado' | 'recaudo_desconocido' | 'monto_no_coincide'

/**
 * Marca el recaudo como pagado y encola la factura SS-Recaudo.
 * La usan el webhook y el polling; es idempotente (un segundo aviso no hace nada).
 */
export async function confirmarPago(
  referencia: string,
  monto: number | string,
  origen: 'webhook' | 'polling',
  pagador?: RecaudoPay['payer'],
): Promise<ResultadoConfirmacion> {
  return db.tx(async (c) => {
    const r = await c.q1(
      `select id, admision_id, estado, monto from recaudos where reference_code = $1 for update`,
      [referencia],
    )
    if (!r) return 'recaudo_desconocido'
    if (r.estado === 'paid') return 'duplicado'
    if (Math.abs(Number(monto) - Number(r.monto)) > 0.009) {
      await c.q(`update recaudos set estado = 'revision', updated_at = now() where id = $1`, [r.id])
      await c.q(
        `update admisiones set estado = 'requiere_revision', nota_estado = $2, updated_at = now() where id = $1`,
        [r.admision_id, `Pago de ${monto} distinto al esperado ${r.monto} (${referencia})`],
      )
      log.warn('cobro.monto_no_coincide', { referencia, recibido: monto, esperado: r.monto })
      return 'monto_no_coincide'
    }
    await c.q(
      `update recaudos set estado = 'paid', pagado_en = now(), pagador = $2, origen_confirmacion = $3, updated_at = now()
       where id = $1`,
      [r.id, JSON.stringify(enmascararPagador(pagador ?? null)), origen],
    )
    await c.q(
      `update admisiones set estado = 'pagada', nota_estado = null, updated_at = now()
       where id = $1 and estado in ('creada', 'cobro_pendiente', 'cobro_vencido', 'cobro_fallido')`,
      [r.admision_id],
    )
    await encolar(c, 'emitir_ss_recaudo', referencia, { reference_code: referencia })
    log.info('cobro.pagado', { referencia, origen })
    return 'pagado'
  })
}

/** Consulta GET /v1/collections/{reference_code} y actualiza el estado local. */
export async function reconciliarRecaudo(rec: { reference_code: string; admision_id: number; qr_expira: string | Date | null }) {
  const referencia = rec.reference_code
  let v: RecaudoPay | null
  try {
    v = await pay().verRecaudo(referencia)
  } catch (e) {
    log.warn('polling.error', { referencia, error: e as Error })
    await db.q(`update recaudos set ultima_consulta = now() where reference_code = $1`, [referencia])
    return 'error'
  }
  await db.q(`update recaudos set ultima_consulta = now() where reference_code = $1`, [referencia])

  if (!v) {
    await db.q(`update recaudos set estado = 'revision', updated_at = now() where reference_code = $1`, [referencia])
    await db.q(
      `update admisiones set estado = 'requiere_revision', nota_estado = $2, updated_at = now() where id = $1`,
      [rec.admision_id, `Factus Pay no encuentra el recaudo ${referencia} (404)`],
    )
    return 'no_encontrado'
  }
  switch (v.status) {
    case 'paid':
      return confirmarPago(referencia, v.amount, 'polling', v.payer)
    case 'rejected':
    case 'failed':
      await db.q(`update recaudos set estado = $2, updated_at = now() where reference_code = $1 and estado <> 'paid'`, [referencia, v.status])
      await db.q(
        `update admisiones set estado = 'cobro_fallido', nota_estado = $2, updated_at = now()
         where id = $1 and estado in ('cobro_pendiente', 'cobro_vencido')`,
        [rec.admision_id, `Pago ${v.status === 'rejected' ? 'rechazado' : 'fallido'} en Factus Pay: no se factura nada`],
      )
      return v.status
    case 'started':
      await db.q(`update recaudos set estado = 'started', updated_at = now() where reference_code = $1 and estado = 'ready'`, [referencia])
      return 'started'
    default: {
      const expira = rec.qr_expira ? new Date(rec.qr_expira) : null
      if (expira && expira.getTime() < Date.now()) {
        await db.q(
          `update admisiones set estado = 'cobro_vencido', nota_estado = 'El QR venció: genera uno nuevo', updated_at = now()
           where id = $1 and estado = 'cobro_pendiente'`,
          [rec.admision_id],
        )
        return 'vencido'
      }
      return 'ready'
    }
  }
}

/** Polling de respaldo: recaudos ready/started de las últimas 24 h que no se consultan hace 25 s. */
export async function reconciliarPendientes(limite = 20) {
  const pendientes = await db.q(
    `select reference_code, admision_id, qr_expira from recaudos
     where estado in ('ready', 'started') and created_at > now() - interval '24 hours'
       and (ultima_consulta is null or ultima_consulta < now() - interval '25 seconds')
     order by ultima_consulta nulls first limit $1`,
    [limite],
  )
  const resultados: Record<string, string> = {}
  for (const r of pendientes) resultados[r.reference_code] = await reconciliarRecaudo(r)
  return resultados
}

/** Reconciliación puntual cuando la pantalla de caja pregunta por una admisión (máx. cada 8 s). */
export async function reconciliarAdmision(admisionId: number) {
  const pendientes = await db.q(
    `select reference_code, admision_id, qr_expira from recaudos
     where admision_id = $1 and estado in ('ready', 'started')
       and (ultima_consulta is null or ultima_consulta < now() - interval '8 seconds')`,
    [admisionId],
  )
  for (const r of pendientes) await reconciliarRecaudo(r)
}

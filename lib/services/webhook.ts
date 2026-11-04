// Receptor del webhook de Factus Pay (sección 6.3). Algoritmo:
//  1. Comparar ?key= con FACTUS_PAY_WEBHOOK_KEY en tiempo constante → 401 si no coincide.
//  2. Guardar el evento crudo en webhook_events (auditoría) ANTES de responder 2xx.
//  3. Buscar el recaudo; si no existe o el monto no cuadra → revisión manual y 200.
//  4. Si ya estaba paid → 200 sin reprocesar.
//  5. Marcar paid, encolar la factura SS-Recaudo y responder 200 en menos de 10 s.
import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '../db'
import { env } from '../env'
import { log } from '../logger'
import { confirmarPago } from './cobros'

export function llaveValida(recibida: string | null | undefined, esperada: string): boolean {
  if (!recibida || !esperada) return false
  // Se comparan hashes de igual longitud para no filtrar ni el largo de la llave
  const a = createHash('sha256').update(recibida).digest()
  const b = createHash('sha256').update(esperada).digest()
  return timingSafeEqual(a, b)
}

function cuerpoAuditable(cuerpo: any) {
  const d = { ...(cuerpo?.data ?? {}) }
  if (d.qr) d.qr = '[omitido]'
  if (d.payer?.document_number) d.payer = { ...d.payer, document_number: `****${String(d.payer.document_number).slice(-4)}` }
  return { ...cuerpo, data: d }
}

export interface RespuestaWebhook {
  status: number
  body: Record<string, unknown>
}

export async function procesarWebhookFactusPay(url: URL, textoCuerpo: string): Promise<RespuestaWebhook> {
  if (!llaveValida(url.searchParams.get('key'), env.payWebhookKey)) {
    log.warn('webhook.llave_invalida', { ruta: url.pathname })
    return { status: 401, body: { error: 'llave inválida' } }
  }

  let cuerpo: any
  try {
    cuerpo = JSON.parse(textoCuerpo)
  } catch {
    await db.q(`insert into webhook_events (cuerpo, resultado) values ($1, 'json_invalido')`, [
      JSON.stringify({ texto: textoCuerpo.slice(0, 2000) }),
    ])
    return { status: 200, body: { received: false, motivo: 'json inválido' } }
  }

  const d = cuerpo?.data ?? {}
  const referencia = typeof d.reference_code === 'string' ? d.reference_code : null
  const evento = await db.q1<{ id: number }>(
    `insert into webhook_events (reference_code, cuerpo, resultado) values ($1, $2, 'recibido') returning id`,
    [referencia, JSON.stringify(cuerpoAuditable(cuerpo))],
  )

  let resultado: string
  if (!referencia) resultado = 'sin_referencia'
  else if (d.status !== 'paid') resultado = `ignorado_estado_${d.status}`
  else resultado = await confirmarPago(referencia, d.amount, 'webhook', d.payer)

  await db.q(`update webhook_events set resultado = $2 where id = $1`, [evento!.id, resultado])
  log.info('webhook.procesado', { referencia, resultado })
  return { status: 200, body: { received: true } }
}

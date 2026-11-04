import { after } from 'next/server'
import { leerJson, responder } from '@/lib/api'
import { env } from '@/lib/env'
import { ErrorNegocio } from '@/lib/errores'
import { pay } from '@/lib/factus'
import { MockPayApi } from '@/lib/factus/payMock'
import { confirmarPago, reconciliarAdmision } from '@/lib/services/cobros'
import { procesarJobs } from '@/lib/services/jobs'
import { procesarWebhookFactusPay } from '@/lib/services/webhook'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// SOLO desarrollo (FACTUS_PAY_MOCK=true): equivale a pagar el QR en el simulador de Factus Pay.
// { "reference_code": "ADM-2026-000001-CUO", "resultado": "paid" | "rejected" | "failed" }
export async function POST(req: Request) {
  return responder(async () => {
    const api = pay()
    if (!env.payMock || !(api instanceof MockPayApi)) throw new ErrorNegocio(404, 'Solo disponible con FACTUS_PAY_MOCK=true')
    const { reference_code, resultado = 'paid' } = await leerJson<{ reference_code: string; resultado?: 'paid' | 'rejected' | 'failed' }>(req)
    const r = api.simular(reference_code, resultado)
    if (!r) throw new ErrorNegocio(404, 'Recaudo no encontrado en el simulador')

    let webhook: unknown = null
    if (resultado === 'paid') {
      // Pasa por el mismo receptor del webhook real (con la llave), como lo haría Factus Pay
      if (env.payWebhookKey) {
        const url = new URL(`http://localhost/webhooks/factus-pay?key=${encodeURIComponent(env.payWebhookKey)}`)
        webhook = await procesarWebhookFactusPay(url, JSON.stringify({ data: r }))
      } else {
        webhook = await confirmarPago(reference_code, r.amount, 'webhook', r.payer)
      }
      after(() => procesarJobs(3).then(() => undefined))
    } else {
      // Factus Pay no envía webhook de pagos fallidos: se detectan por polling
      const rec = await db.q1(`select admision_id from recaudos where reference_code = $1`, [reference_code])
      if (rec) {
        await db.q(`update recaudos set ultima_consulta = null where reference_code = $1`, [reference_code])
        await reconciliarAdmision(rec.admision_id)
      }
    }
    return { simulado: r.status, webhook }
  })
}

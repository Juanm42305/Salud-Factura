import { after } from 'next/server'
import { log } from '@/lib/logger'
import { procesarJobs } from '@/lib/services/jobs'
import { procesarWebhookFactusPay } from '@/lib/services/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// URL a registrar en el panel de Factus Pay: https://<app>/webhooks/factus-pay  (la llave va en ?key=)
export async function POST(req: Request) {
  try {
    const r = await procesarWebhookFactusPay(new URL(req.url), await req.text())
    // Se responde ya (< 10 s); la factura SS-Recaudo se emite después de la respuesta
    if (r.status === 200) {
      after(() => procesarJobs(3).then(() => undefined).catch((e) => log.error('webhook.after', { error: e as Error })))
    }
    return Response.json(r.body, { status: r.status })
  } catch (e) {
    // Sin 2xx: Factus Pay reintenta (1 min, 5 min, 15 min, 1 h, 3 h)
    log.error('webhook.error', { error: e as Error })
    return Response.json({ received: false }, { status: 500 })
  }
}

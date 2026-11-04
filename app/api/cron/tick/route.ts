import { createHash, timingSafeEqual } from 'node:crypto'
import { responder } from '@/lib/api'
import { env } from '@/lib/env'
import { tick } from '@/lib/services/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const igual = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

// Polling de recaudos + cola. Para Vercel: llamarlo cada minuto desde cron-job.org con
// el encabezado "Authorization: Bearer <CRON_SECRET>".
async function manejar(req: Request) {
  const secreto = env.cronSecret
  const dado = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!secreto || !dado || !igual(dado, secreto)) return Response.json({ error: 'no autorizado' }, { status: 401 })
  return responder(tick)
}

export const GET = manejar
export const POST = manejar

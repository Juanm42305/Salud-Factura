import { responder } from '@/lib/api'
import { carteraPorEps } from '@/lib/services/cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return responder(carteraPorEps)
}

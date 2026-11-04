import { responder } from '@/lib/api'
import { catalogos } from '@/lib/services/admisiones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return responder(catalogos)
}

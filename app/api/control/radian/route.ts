import { responder } from '@/lib/api'
import { estadoRadian } from '@/lib/services/control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Eventos RADIAN (acuse, reclamo, aceptación) de las últimas facturas SS-CUFE
export async function GET() {
  return responder(estadoRadian)
}

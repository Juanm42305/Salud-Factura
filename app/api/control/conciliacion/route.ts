import { responder } from '@/lib/api'
import { conciliacion } from '@/lib/services/control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Recaudos pagados en Factus Pay frente a facturas SS-Recaudo validadas en Factus Facturación
export async function GET() {
  return responder(conciliacion)
}

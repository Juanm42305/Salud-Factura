import { responder } from '@/lib/api'
import { estadoSalud } from '@/lib/services/salud'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Prueba de vida: tokens de ambas APIs de Factus y base de datos
export async function GET() {
  return responder(estadoSalud)
}

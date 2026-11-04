import { responder } from '@/lib/api'
import { impactoValidador } from '@/lib/services/control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Documentos que el validador detuvo antes de Factus ("glosas evitadas")
export async function GET() {
  return responder(impactoValidador)
}

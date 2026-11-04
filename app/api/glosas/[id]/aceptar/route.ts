import { idDe, responder } from '@/lib/api'
import { aceptarGlosa } from '@/lib/services/glosas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Acepta la glosa y emite la nota crédito en Factus
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => aceptarGlosa(idDe((await params).id)))
}

import { idDe, responder } from '@/lib/api'
import { rechazarGlosa } from '@/lib/services/glosas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// La IPS no acepta la glosa: queda "respondida" y no se emite nada
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => rechazarGlosa(idDe((await params).id)))
}

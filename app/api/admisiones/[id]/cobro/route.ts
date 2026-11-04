import { idDe, responder } from '@/lib/api'
import { crearCobro } from '@/lib/services/cobros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Crea el recaudo en Factus Pay (POST /v1/collections) y devuelve el QR. Si el QR venció, lo regenera.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => crearCobro(idDe((await params).id)), 201)
}

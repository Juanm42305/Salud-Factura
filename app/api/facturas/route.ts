import { responder } from '@/lib/api'
import { listarFacturas } from '@/lib/services/facturas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/facturas?tipo=SS-CUFE&estado=validada
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  return responder(() => listarFacturas({ tipo: p.get('tipo') ?? undefined, estado: p.get('estado') ?? undefined }))
}

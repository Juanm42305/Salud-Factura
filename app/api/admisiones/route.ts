import { leerJson, responder } from '@/lib/api'
import { crearAdmision, listarAdmisiones, type NuevaAdmision } from '@/lib/services/admisiones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/admisiones?estado=copago_facturado,atencion_cerrada
export async function GET(req: Request) {
  const estado = new URL(req.url).searchParams.get('estado')
  return responder(() => listarAdmisiones(estado ? estado.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
}

// POST /api/admisiones: crea la admisión y calcula el copago
export async function POST(req: Request) {
  return responder(async () => crearAdmision(await leerJson<NuevaAdmision>(req)), 201)
}

import { leerJson, responder } from '@/lib/api'
import { ErrorNegocio } from '@/lib/errores'
import { previsualizarSsCufe } from '@/lib/services/facturas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Corre el validador sin enviar nada a Factus: { "tipo": "ssCufe", "admision_id": 1, "opciones": {...} }
export async function POST(req: Request) {
  return responder(async () => {
    const b = await leerJson<{ tipo?: string; admision_id?: number; opciones?: Record<string, unknown> }>(req)
    if (b.tipo !== 'ssCufe') throw new ErrorNegocio(400, 'Por ahora el previsualizador soporta tipo "ssCufe"')
    if (!Number.isInteger(b.admision_id)) throw new ErrorNegocio(400, 'admision_id es obligatorio')
    return previsualizarSsCufe(b.admision_id!, b.opciones ?? {})
  })
}

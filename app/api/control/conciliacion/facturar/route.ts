import { leerJson, responder } from '@/lib/api'
import { ErrorNegocio } from '@/lib/errores'
import { facturarPendiente } from '@/lib/services/control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// "Facturar ahora": { "reference_code": "ADM-...-CUO" }
export async function POST(req: Request) {
  return responder(async () => {
    const { reference_code } = await leerJson<{ reference_code?: string }>(req)
    if (!reference_code) throw new ErrorNegocio(400, 'reference_code es obligatorio')
    return facturarPendiente(reference_code)
  })
}

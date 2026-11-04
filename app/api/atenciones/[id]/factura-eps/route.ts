import { idDe, responder } from '@/lib/api'
import type { OpcionesSsCufe } from '@/lib/builders/ssCufe'
import { ErrorNegocio } from '@/lib/errores'
import { emitirSsCufe } from '@/lib/services/facturas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Valida y emite la factura SS-CUFE a la EPS con los copagos en prepayment_details.
// Cuerpo opcional: { "sinContrato": true, "withoutContractCode": "01", "policyNumber": "..." }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const id = idDe((await params).id)
    const texto = (await req.text()).trim()
    let opciones: OpcionesSsCufe = {}
    if (texto) {
      try {
        opciones = JSON.parse(texto)
      } catch {
        throw new ErrorNegocio(400, 'El cuerpo debe ser JSON válido')
      }
    }
    return emitirSsCufe(id, opciones)
  })
}

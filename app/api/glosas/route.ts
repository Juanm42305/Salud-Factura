import { leerJson, responder } from '@/lib/api'
import { listarGlosas, registrarGlosa, type NuevaGlosa } from '@/lib/services/glosas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return responder(listarGlosas)
}

// { factura_id, item, valor, motivo, tipo: servicio_no_aceptado | factura_rechazada | diferencia_tarifa | descuento_pactado }
export async function POST(req: Request) {
  return responder(async () => registrarGlosa(await leerJson<NuevaGlosa>(req)), 201)
}

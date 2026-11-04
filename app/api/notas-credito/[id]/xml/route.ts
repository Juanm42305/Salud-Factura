import { idDe, responderArchivo } from '@/lib/api'
import { descargarDocumento } from '@/lib/services/facturas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Descarga el XML desde Factus (prueba de validación DIAN en la demo)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return responderArchivo(async () => descargarDocumento('nota', idDe((await params).id), 'xml'))
}

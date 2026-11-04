import { after } from 'next/server'
import { idDe, responder } from '@/lib/api'
import { log } from '@/lib/logger'
import { obtenerAdmision } from '@/lib/services/admisiones'
import { reconciliarAdmision } from '@/lib/services/cobros'
import { procesarJobs } from '@/lib/services/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Estado de la admisión, recaudo y facturas. La pantalla de caja lo consulta cada 3 s;
// de paso reconcilia con Factus Pay (respaldo si el webhook no llega) y procesa la cola.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const id = idDe((await params).id)
    await reconciliarAdmision(id).catch((e) => log.warn('admision.reconciliar', { id, error: e as Error }))
    after(() => procesarJobs(3).then(() => undefined).catch((e) => log.error('after.jobs', { error: e as Error })))
    return obtenerAdmision(id)
  })
}

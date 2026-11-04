// Ayudas para los route.ts: respuesta JSON uniforme y traducción de errores a HTTP.
import { ErrorApi, ErrorNegocio, ErrorValidacion } from './errores'
import { log } from './logger'

export async function responder(fn: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    const r = await fn()
    return Response.json(r ?? { ok: true }, { status })
  } catch (e) {
    // Se compara por nombre y no con instanceof: en `next dev` cada ruta tiene su propia copia de las clases
    const nombre = (e as Error)?.name
    if (nombre === 'ErrorValidacion') {
      const v = e as ErrorValidacion
      return Response.json({ error: v.message, hallazgos: v.hallazgos, payload: v.payload }, { status: 422 })
    }
    if (nombre === 'ErrorNegocio') {
      const n = e as ErrorNegocio
      return Response.json({ error: n.message, detalle: n.detalle }, { status: n.status })
    }
    if (nombre === 'ErrorApi') {
      const a = e as ErrorApi
      log.error('api.factus', { api: a.api, status: a.status, mensaje: a.message })
      return Response.json({ error: a.message, api: a.api, status_api: a.status }, { status: 502 })
    }
    log.error('api.error_interno', { error: e as Error })
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function leerJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new ErrorNegocio(400, 'El cuerpo debe ser JSON válido')
  }
}

export function idDe(valor: string): number {
  const n = Number(valor)
  if (!Number.isInteger(n) || n <= 0) throw new ErrorNegocio(400, 'id inválido')
  return n
}

/** Respuesta de archivo (PDF/XML) para ver en el navegador; los errores salen como JSON. */
export async function responderArchivo(
  fn: () => Promise<{ nombre: string; contenido: Buffer; tipoMime: string }>,
): Promise<Response> {
  try {
    const d = await fn()
    return new Response(new Uint8Array(d.contenido), {
      headers: {
        'Content-Type': d.tipoMime,
        'Content-Disposition': `inline; filename="${d.nombre.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return responder(() => Promise.reject(e))
  }
}

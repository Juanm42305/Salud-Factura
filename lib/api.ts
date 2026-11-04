// Ayudas para los route.ts: respuesta JSON uniforme y traducción de errores a HTTP.
import { ErrorApi, ErrorNegocio, ErrorValidacion } from './errores'
import { log } from './logger'

export async function responder(fn: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    const r = await fn()
    return Response.json(r ?? { ok: true }, { status })
  } catch (e) {
    if (e instanceof ErrorValidacion) {
      return Response.json({ error: e.message, hallazgos: e.hallazgos, payload: e.payload }, { status: 422 })
    }
    if (e instanceof ErrorNegocio) {
      return Response.json({ error: e.message, detalle: e.detalle }, { status: e.status })
    }
    if (e instanceof ErrorApi) {
      log.error('api.factus', { api: e.api, status: e.status, mensaje: e.message })
      return Response.json({ error: e.message, api: e.api, status_api: e.status }, { status: 502 })
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

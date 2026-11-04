import type { Hallazgo } from './validation/tipos'

/** Error de negocio que el endpoint devuelve tal cual al frontend (400, 404, 409, 422...). */
export class ErrorNegocio extends Error {
  constructor(public status: number, mensaje: string, public detalle?: unknown) {
    super(mensaje)
    this.name = 'ErrorNegocio'
  }
}

/** El validador bloqueó el documento antes de enviarlo a Factus. */
export class ErrorValidacion extends ErrorNegocio {
  constructor(public hallazgos: Hallazgo[], public payload?: unknown) {
    super(422, 'El validador bloqueó el documento antes de enviarlo a la DIAN', { hallazgos, payload })
    this.name = 'ErrorValidacion'
  }
}

/** Falla de un trabajo en cola que no tiene sentido reintentar (datos inválidos, rechazo DIAN...). */
export class ErrorNoReintentable extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorNoReintentable'
  }
}

/** Respuesta no exitosa de una API de Factus. */
export class ErrorApi extends Error {
  constructor(
    public api: 'factus' | 'factus_pay',
    public status: number,
    public cuerpo: unknown,
    mensaje: string,
    public reintentable = false,
  ) {
    super(mensaje)
    this.name = 'ErrorApi'
  }
}

/** Saca un mensaje legible del cuerpo de error de Factus (message, errors por campo, etc.). */
export function mensajeDe(cuerpo: unknown, porDefecto = 'Error sin detalle'): string {
  if (!cuerpo) return porDefecto
  if (typeof cuerpo === 'string') return cuerpo.slice(0, 500)
  const c = cuerpo as Record<string, unknown>
  const partes: string[] = []
  if (typeof c.message === 'string') partes.push(c.message)
  const errores = (c.errors ?? (c.data as Record<string, unknown> | undefined)?.errors) as unknown
  if (errores && typeof errores === 'object') {
    for (const [campo, v] of Object.entries(errores as Record<string, unknown>)) {
      const texto = Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : JSON.stringify(v)
      partes.push(`${campo}: ${texto}`)
    }
  }
  return partes.length ? partes.join(' | ').slice(0, 1000) : porDefecto
}

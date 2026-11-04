import { REGLAS } from './reglas'
import type { Contexto, Hallazgo } from './tipos'

export interface ResultadoValidacion {
  ok: boolean // sin errores (las advertencias dejan pasar)
  errores: Hallazgo[]
  advertencias: Hallazgo[]
  hallazgos: Hallazgo[]
}

export function validar(payload: unknown, ctx: Contexto): ResultadoValidacion {
  const hallazgos = (REGLAS[ctx.tipo] ?? []).flatMap((regla) => regla(payload ?? {}, ctx))
  const errores = hallazgos.filter((x) => x.nivel === 'error')
  return { ok: errores.length === 0, errores, advertencias: hallazgos.filter((x) => x.nivel === 'advertencia'), hallazgos }
}

export type { Contexto, Hallazgo } from './tipos'

// Bitácora del validador: guarda cada documento que el motor de reglas detuvo (o advirtió)
// antes de llegar a Factus. Es la base del indicador de "glosas evitadas".
// Nunca interrumpe el flujo principal: si la tabla no existe todavía, solo deja un aviso en el log.
import { db } from '../db'
import { log } from '../logger'
import type { ResultadoValidacion } from '../validation'

export interface EntradaBitacora {
  tipo: 'recaudoPay' | 'ssRecaudo' | 'ssCufe' | 'notaCredito'
  origen?: 'emision' | 'previsualizacion'
  referencia: string
  admisionId?: number | null
  resultado: ResultadoValidacion
  valor?: number | null
}

export async function registrarValidacion(e: EntradaBitacora): Promise<void> {
  if (e.resultado.hallazgos.length === 0) return
  try {
    await db.q(
      `insert into validaciones_log (tipo, origen, referencia, admision_id, bloqueado, errores, advertencias, valor)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        e.tipo,
        e.origen ?? 'emision',
        e.referencia,
        e.admisionId ?? null,
        !e.resultado.ok,
        JSON.stringify(e.resultado.errores),
        JSON.stringify(e.resultado.advertencias),
        e.valor ?? null,
      ],
    )
  } catch (err) {
    log.warn('bitacora_validacion.no_guardada', { error: err as Error })
  }
}

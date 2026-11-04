// Glosas de la EPS y notas crédito (sección 9). Módulo de menor prioridad.
import { construirNotaCredito } from '../builders/notaCredito'
import { totalItems } from '../builders/comun'
import { db } from '../db'
import { env } from '../env'
import { ErrorNegocio, ErrorValidacion } from '../errores'
import { factus } from '../factus'
import { validar } from '../validation'
import { CONCEPTO_CORRECCION, type TipoGlosa } from '../validation/tablas'
import { guardarResultado } from './facturas'

export interface NuevaGlosa {
  factura_id: number
  item?: string | null
  valor: number
  motivo: string
  tipo: TipoGlosa
}

export async function registrarGlosa(d: NuevaGlosa) {
  if (!(d.tipo in CONCEPTO_CORRECCION)) throw new ErrorNegocio(400, 'Tipo de glosa inválido')
  if (!(Number(d.valor) > 0)) throw new ErrorNegocio(400, 'El valor glosado debe ser mayor a cero')
  if (!d.motivo?.trim()) throw new ErrorNegocio(400, 'Escribe el motivo de la glosa')
  const f = await db.q1(`select id, tipo, estado, admision_id from facturas where id = $1`, [d.factura_id])
  if (!f || f.tipo !== 'SS-CUFE' || f.estado !== 'validada')
    throw new ErrorNegocio(409, 'Solo se glosan facturas SS-CUFE validadas')

  return db.tx(async (c) => {
    const sig = await c.q1<{ n: number }>(
      `select coalesce(max(consecutivo), 0) + 1 as n from glosas where factura_id = $1`,
      [f.id],
    )
    const glosa = await c.q1(
      `insert into glosas (factura_id, consecutivo, item, valor, motivo, tipo) values ($1, $2, $3, $4, $5, $6) returning *`,
      [f.id, Number(sig!.n), d.item ?? null, Number(d.valor), d.motivo.trim(), d.tipo],
    )
    await c.q(
      `update admisiones set estado = 'glosada', updated_at = now() where id = $1 and estado in ('facturada_eps', 'glosada')`,
      [f.admision_id],
    )
    return glosa
  })
}

export async function rechazarGlosa(id: number) {
  const g = await db.q1(
    `update glosas set estado = 'respondida', updated_at = now() where id = $1 and estado = 'registrada' returning *`,
    [id],
  )
  if (!g) throw new ErrorNegocio(409, 'La glosa no existe o ya fue gestionada')
  return g
}

export async function aceptarGlosa(id: number) {
  const g = await db.q1(
    `select g.*, f.numero as factura_numero, f.reference_code as factura_ref, f.payload as factura_payload, f.total as factura_total
     from glosas g join facturas f on f.id = g.factura_id where g.id = $1`,
    [id],
  )
  if (!g) throw new ErrorNegocio(404, 'Glosa no encontrada')
  if (g.estado === 'respondida') throw new ErrorNegocio(409, 'La glosa fue rechazada (respondida); no genera nota crédito')
  if (g.estado === 'cerrada') return db.q1(`select * from notas_credito where glosa_id = $1`, [id])

  const previas = await db.q1<{ s: number }>(
    `select coalesce(sum(total), 0) as s from notas_credito where factura_id = $1 and estado = 'validada' and glosa_id <> $2`,
    [g.factura_id, id],
  )
  const saldo = Number(g.factura_total) - Number(previas!.s)
  const payload = construirNotaCredito({
    factura: { numero: g.factura_numero, reference_code: g.factura_ref, payload: g.factura_payload },
    glosa: { id: g.id, consecutivo: g.consecutivo, tipo: g.tipo, item: g.item, valor: Number(g.valor), motivo: g.motivo },
    numberingRangeId: env.factusRangoNotas,
  })
  const val = validar(payload, { tipo: 'notaCredito', saldoFactura: saldo })
  const nota = await db.q1<{ id: number }>(
    `insert into notas_credito (reference_code, glosa_id, factura_id, concepto_correccion, estado, total, payload, errores_validacion)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (reference_code) do update set estado = excluded.estado, total = excluded.total,
       payload = excluded.payload, errores_validacion = excluded.errores_validacion, updated_at = now()
     where notas_credito.estado <> 'validada'
     returning id`,
    [payload.reference_code, id, g.factura_id, payload.correction_concept_code, val.ok ? 'enviando' : 'bloqueada',
      totalItems(payload.items), JSON.stringify(payload), JSON.stringify(val.hallazgos)],
  )
  if (!nota) return db.q1(`select * from notas_credito where glosa_id = $1`, [id])
  if (!val.ok) throw new ErrorValidacion(val.hallazgos, payload)

  await db.q(`update glosas set estado = 'aceptada', updated_at = now() where id = $1`, [id])
  const r = await factus().validarNotaCredito(payload)
  await guardarResultado('notas_credito', nota.id, r)
  const guardada = await db.q1(`select * from notas_credito where id = $1`, [nota.id])
  if (r.ok && r.doc.is_validated) {
    await db.q(`update glosas set estado = 'cerrada', updated_at = now() where id = $1`, [id])
    return guardada
  }
  throw new ErrorNegocio(502, `Factus no validó la nota crédito: ${r.ok ? 'rechazada por la DIAN' : r.mensaje}`, { nota: guardada })
}

export async function listarGlosas() {
  return db.q(
    `select g.id, g.factura_id, g.consecutivo, g.item, g.valor, g.motivo, g.tipo, g.estado, g.created_at,
        f.numero as factura_numero, f.reference_code as factura_ref, e.razon_social as eps,
        n.id as nota_id, n.numero as nota_numero, n.estado as nota_estado, n.error_mensaje as nota_error
     from glosas g
     join facturas f on f.id = g.factura_id
     join admisiones a on a.id = f.admision_id
     join contratos c on c.id = a.contrato_id
     join eps e on e.id = c.eps_id
     left join notas_credito n on n.glosa_id = g.id
     order by g.id desc limit 100`,
  )
}

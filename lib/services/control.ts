// Panel de control: lo que el validador evitó, la conciliación entre las dos APIs de Factus
// y el estado RADIAN de las facturas a las EPS.
import { db } from '../db'
import { ErrorNegocio } from '../errores'
import { factus, pay } from '../factus'
import type { EventoRadian } from '../factus/factusClient'
import type { RecaudoPay } from '../factus/payClient'
import { log } from '../logger'
import { reconciliarRecaudo } from './cobros'
import { procesarJobs } from './jobs'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ── 1. Glosas evitadas por el validador ────────────────────────

export async function impactoValidador() {
  const resumen = await db.q1(
    `with b as (
       select referencia, max(valor) as valor
       from validaciones_log where bloqueado group by referencia
     )
     select count(*)::int as documentos_detenidos,
       coalesce(sum(valor), 0) as valor_protegido,
       count(*) filter (where exists (select 1 from facturas f where f.reference_code = b.referencia and f.estado = 'validada')
         or exists (select 1 from notas_credito n where n.reference_code = b.referencia and n.estado = 'validada'))::int
         as corregidos_y_validados
     from b`,
  )
  const porRegla = await db.q(
    `select e->>'codigo' as codigo, count(distinct l.referencia)::int as documentos, min(e->>'mensaje') as ejemplo
     from validaciones_log l cross join lateral jsonb_array_elements(l.errores) e
     where l.bloqueado
     group by 1 order by 2 desc, 1`,
  )
  const advertencias = await db.q1(
    `select count(distinct referencia)::int as documentos
     from validaciones_log where jsonb_array_length(advertencias) > 0`,
  )
  const ultimos = await db.q(
    `select l.creado_en, l.tipo, l.origen, l.referencia, l.valor,
       (select string_agg(distinct x->>'codigo', ', ') from jsonb_array_elements(l.errores) x) as codigos
     from validaciones_log l where l.bloqueado order by l.id desc limit 8`,
  )
  return {
    documentos_detenidos: Number(resumen?.documentos_detenidos ?? 0),
    valor_protegido: Number(resumen?.valor_protegido ?? 0),
    corregidos_y_validados: Number(resumen?.corregidos_y_validados ?? 0),
    con_advertencias: Number(advertencias?.documentos ?? 0),
    por_regla: porRegla,
    ultimos,
  }
}

// ── 2. Conciliación Factus Pay ↔ Factus Facturación ────────────

export type EstadoConciliacion =
  | 'conciliado' // pagado en Factus Pay y con factura SS-Recaudo validada
  | 'pagado_sin_factura' // pagado en Factus Pay, sin factura validada: se puede facturar ya
  | 'monto_distinto' // el pago no coincide con el recaudo registrado
  | 'no_registrado' // pagado en Factus Pay con nuestro prefijo, pero no está en la base
  | 'sin_pago_en_pay' // marcado pagado aquí, pero Factus Pay no lo reporta pagado

/** Prefijo de nuestras referencias en Factus Pay (la cuenta puede tener recaudos de otros). */
function prefijoReferencias(): string {
  const equipo = (process.env.REFERENCIA_EQUIPO ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return equipo ? `ADM-${equipo}-` : 'ADM-'
}

export async function conciliacion() {
  const prefijo = prefijoReferencias()
  let remotos: RecaudoPay[] = []
  let errorPay: string | null = null
  try {
    remotos = (await pay().listarRecaudos('paid')).filter((r) => r.reference_code.startsWith(prefijo))
  } catch (e) {
    errorPay = msg(e)
    log.warn('conciliacion.pay', { error: e as Error })
  }

  const locales = await db.q(
    `select r.reference_code, r.monto, r.estado, r.pagado_en, r.origen_confirmacion, r.admision_id,
        a.codigo as admision_codigo, p.nombres || ' ' || p.apellidos as paciente,
        f.id as factura_id, f.numero as factura_numero, f.estado as factura_estado, f.total as factura_total
     from recaudos r
     join admisiones a on a.id = r.admision_id
     join pacientes p on p.id = a.paciente_id
     left join facturas f on f.recaudo_id = r.id and f.tipo = 'SS-Recaudo'
     where r.reference_code like $1
     order by r.id desc limit 500`,
    [`${prefijo}%`],
  )
  const porRef = new Map(locales.map((l) => [l.reference_code as string, l]))
  const remotosPorRef = new Map(remotos.map((r) => [r.reference_code, r]))

  const items: any[] = []
  for (const r of remotos) {
    const l = porRef.get(r.reference_code)
    let estado: EstadoConciliacion
    if (!l) estado = 'no_registrado'
    else if (Math.abs(Number(r.amount) - Number(l.monto)) > 0.009) estado = 'monto_distinto'
    else if (l.factura_estado === 'validada') estado = 'conciliado'
    else estado = 'pagado_sin_factura'
    items.push({
      reference_code: r.reference_code,
      estado,
      monto_pay: Number(r.amount),
      monto_local: l ? Number(l.monto) : null,
      cobrado_en: r.collected_at ?? null,
      admision_id: l?.admision_id ?? null,
      admision_codigo: l?.admision_codigo ?? null,
      paciente: l?.paciente ?? null,
      estado_local: l?.estado ?? null,
      confirmado_por: l?.origen_confirmacion ?? null,
      factura_id: l?.factura_id ?? null,
      factura_numero: l?.factura_numero ?? null,
      factura_estado: l?.factura_estado ?? null,
    })
  }
  // Pagados aquí que Factus Pay no reporta (solo si la consulta a Factus Pay funcionó)
  if (!errorPay) {
    for (const l of locales.filter((x) => x.estado === 'paid' && !remotosPorRef.has(x.reference_code))) {
      items.push({
        reference_code: l.reference_code,
        estado: 'sin_pago_en_pay' as EstadoConciliacion,
        monto_pay: null,
        monto_local: Number(l.monto),
        cobrado_en: null,
        admision_id: l.admision_id,
        admision_codigo: l.admision_codigo,
        paciente: l.paciente,
        estado_local: l.estado,
        confirmado_por: l.origen_confirmacion,
        factura_id: l.factura_id,
        factura_numero: l.factura_numero,
        factura_estado: l.factura_estado,
      })
    }
  }

  const conciliados = items.filter((i) => i.estado === 'conciliado')
  const recaudado = remotos.reduce((s, r) => s + Number(r.amount), 0)
  const facturado = conciliados.reduce((s, i) => s + Number(i.monto_pay), 0)
  return {
    fuente: pay().modo,
    prefijo,
    error_pay: errorPay,
    pagados_en_pay: remotos.length,
    conciliados: conciliados.length,
    porcentaje: remotos.length ? Math.round((conciliados.length / remotos.length) * 1000) / 10 : null,
    recaudado,
    facturado,
    diferencia: recaudado - facturado,
    pendientes: items.filter((i) => i.estado !== 'conciliado').length,
    items,
  }
}

/**
 * "Facturar ahora" para un recaudo pagado sin factura: confirma el pago con Factus Pay
 * (si aquí no figuraba pagado) o vuelve a encolar la factura (si el trabajo había fallado).
 */
export async function facturarPendiente(referencia: string) {
  const r = await db.q1(`select reference_code, admision_id, qr_expira, estado from recaudos where reference_code = $1`, [referencia])
  if (!r) throw new ErrorNegocio(404, 'Ese recaudo no está registrado en SaludFactura')
  let paso: string
  if (r.estado !== 'paid') {
    paso = `consulta a Factus Pay: ${await reconciliarRecaudo(r)}`
  } else {
    await db.q(
      `insert into jobs (tipo, clave, payload) values ('emitir_ss_recaudo', $1, $2)
       on conflict (tipo, clave) do update set estado = 'pendiente', intentos = 0, proximo_intento = now(),
         ultimo_error = null, updated_at = now()
       where jobs.estado <> 'procesando'`,
      [referencia, JSON.stringify({ reference_code: referencia })],
    )
    paso = 'factura reencolada'
  }
  await procesarJobs(3)
  const factura = await db.q1(
    `select id, numero, estado, error_mensaje from facturas where reference_code = $1`,
    [`FV-${referencia}`],
  )
  return { reference_code: referencia, paso, factura }
}

// ── 3. Estado RADIAN de las facturas a las EPS ─────────────────

/** Códigos de evento RADIAN (DIAN) sobre la factura electrónica de venta. */
export const EVENTOS_RADIAN: Record<string, string> = {
  '030': 'Acuse de recibo',
  '031': 'Reclamo',
  '032': 'Recibo del bien o servicio',
  '033': 'Aceptación expresa',
  '034': 'Aceptación tácita',
}

function resumenRadian(eventos: EventoRadian[]): { estado: string; detalle: string } {
  const codigos = new Set(eventos.map((e) => e.codigo))
  if (codigos.has('031')) return { estado: 'reclamada', detalle: 'La EPS reclamó la factura: es una glosa en camino' }
  if (codigos.has('033')) return { estado: 'aceptada', detalle: 'Aceptación expresa de la EPS' }
  if (codigos.has('034')) return { estado: 'aceptada', detalle: 'Aceptación tácita: la EPS no reclamó a tiempo' }
  if (codigos.has('032')) return { estado: 'recibida', detalle: 'La EPS confirmó la prestación del servicio' }
  if (codigos.has('030')) return { estado: 'acuse', detalle: 'La EPS acusó recibo de la factura' }
  return { estado: 'sin_eventos', detalle: 'La EPS aún no registra eventos en RADIAN' }
}

export async function estadoRadian() {
  const facturas = await db.q(
    `select f.id, f.numero, f.reference_code, f.total_neto, f.updated_at, e.razon_social as eps
     from facturas f
     join admisiones a on a.id = f.admision_id
     join contratos c on c.id = a.contrato_id
     join eps e on e.id = c.eps_id
     where f.tipo = 'SS-CUFE' and f.estado = 'validada' and f.numero is not null
     order by f.id desc limit 8`,
  )
  const api = factus()
  const resultados = await Promise.all(
    facturas.map(async (f) => {
      try {
        const eventos = await api.eventosRadian(f.numero)
        return { ...f, eventos, ...resumenRadian(eventos), error: null }
      } catch (e) {
        return { ...f, eventos: [], estado: 'error', detalle: msg(e), error: msg(e) }
      }
    }),
  )
  return { consultado_en: new Date().toISOString(), facturas: resultados }
}

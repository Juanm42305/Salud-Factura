// Parte 2 · Facturación con Factus: SS-Recaudo al confirmar el pago y SS-CUFE a la EPS.
import { construirSsCufe, type OpcionesSsCufe } from '../builders/ssCufe'
import { construirSsRecaudo, referenciaFacturaRecaudo } from '../builders/ssRecaudo'
import { fechaColombia, totalItems } from '../builders/comun'
import { db } from '../db'
import { env } from '../env'
import { ErrorNegocio, ErrorNoReintentable, ErrorValidacion, mensajeDe } from '../errores'
import { factus, pay } from '../factus'
import type { ResultadoEmision, TipoDocumento } from '../factus/factusClient'
import { log } from '../logger'
import { validar } from '../validation'
import type { Contexto } from '../validation/tipos'
import { registrarValidacion } from './bitacoraValidacion'
import { codigoAtencion } from './referencias'

async function marcarRevision(admisionId: number, nota: string) {
  await db.q(
    `update admisiones set estado = 'requiere_revision', nota_estado = $2, updated_at = now() where id = $1`,
    [admisionId, nota.slice(0, 500)],
  )
}

/** Guarda en facturas / notas_credito lo que respondió Factus. */
export async function guardarResultado(tabla: 'facturas' | 'notas_credito', id: number, r: ResultadoEmision) {
  const colCodigo = tabla === 'facturas' ? 'cufe' : 'cude'
  if (r.ok) {
    const validada = r.doc.is_validated
    await db.q(
      `update ${tabla} set factus_id = $2, numero = $3, ${colCodigo} = $4, is_validated = $5, estado = $6,
         public_url = $7, qr_url = $8, respuesta = $9, error_mensaje = $10, updated_at = now()
       where id = $1`,
      [
        id,
        r.doc.id,
        r.doc.numero,
        r.doc.cufe,
        validada,
        validada ? 'validada' : 'rechazada',
        r.doc.public_url,
        r.doc.qr,
        JSON.stringify(r.doc.raw ?? null),
        validada ? null : mensajeDe({ errors: r.doc.errores }, 'La DIAN no validó el documento'),
      ],
    )
    log.info(`${tabla}.resultado`, { id, numero: r.doc.numero, validada, via: r.via })
  } else {
    await db.q(
      `update ${tabla} set estado = $2, respuesta = $3, error_mensaje = $4, updated_at = now() where id = $1`,
      [id, r.requiereRevision ? 'requiere_revision' : 'error', JSON.stringify(r.cuerpo ?? null), r.mensaje],
    )
    log.warn(`${tabla}.error`, { id, status: r.status, mensaje: r.mensaje })
  }
}

// ── SS-Recaudo ─────────────────────────────────────────────────

/** Trabajo en cola: emite la factura del copago una vez confirmado el pago. */
export async function emitirSsRecaudo(referenciaRecaudo: string) {
  const d = await db.q1(
    `select r.id as recaudo_id, r.reference_code, r.monto, r.concepto, r.estado,
        a.id as admision_id, a.codigo as admision_codigo,
        p.tipo_doc_salud, p.numero_doc, p.nombres, p.apellidos, p.email, p.telefono, p.direccion, p.municipio_codigo,
        c.esquema_recaudo, c.metodo_pago, e.nit as eps_nit
     from recaudos r
     join admisiones a on a.id = r.admision_id
     join pacientes p on p.id = a.paciente_id
     join contratos c on c.id = a.contrato_id
     join eps e on e.id = c.eps_id
     where r.reference_code = $1`,
    [referenciaRecaudo],
  )
  if (!d) throw new ErrorNoReintentable(`No existe el recaudo ${referenciaRecaudo}`)

  const refFactura = referenciaFacturaRecaudo(referenciaRecaudo)
  const previa = await db.q1(`select id, estado from facturas where reference_code = $1`, [refFactura])
  if (previa?.estado === 'validada') return

  // Antes de facturar se confirma con Factus Pay que el recaudo está pagado y el monto coincide
  const v = await pay().verRecaudo(referenciaRecaudo)
  if (!v || v.status !== 'paid' || Math.abs(Number(v.amount) - Number(d.monto)) > 0.009) {
    const nota = `Factus Pay no confirma el pago de ${referenciaRecaudo} (estado ${v?.status ?? 'no encontrado'}, monto ${v?.amount ?? '-'})`
    await marcarRevision(d.admision_id, nota)
    throw new ErrorNoReintentable(nota)
  }

  const servicio = await db.q1(
    `select codigo, nombre from admision_servicios where admision_id = $1 order by id limit 1`,
    [d.admision_id],
  )
  const payload = construirSsRecaudo({
    admisionCodigo: d.admision_codigo,
    recaudo: { reference_code: d.reference_code, monto: Number(d.monto), concepto: d.concepto },
    paciente: d,
    esquemaRecaudo: Number(d.esquema_recaudo) === 1 ? 1 : 0,
    eps: { nit: d.eps_nit },
    servicio: servicio ?? { codigo: 'SERV', nombre: 'Servicio de salud' },
    numberingRangeId: env.factusRangoFacturas,
    metodoPago: '47',
  })
  const val = validar(payload, { tipo: 'ssRecaudo', recaudo: { estado: d.estado, monto: Number(d.monto) } })
  const total = totalItems(payload.items)
  await registrarValidacion({ tipo: 'ssRecaudo', referencia: refFactura, admisionId: d.admision_id, resultado: val, valor: total })

  const factura = await db.q1<{ id: number }>(
    `insert into facturas (reference_code, tipo, admision_id, recaudo_id, estado, total, total_neto, payload, errores_validacion)
     values ($1, 'SS-Recaudo', $2, $3, $4, $5, $5, $6, $7)
     on conflict (reference_code) do update set estado = excluded.estado, payload = excluded.payload,
       errores_validacion = excluded.errores_validacion, total = excluded.total, total_neto = excluded.total_neto,
       updated_at = now()
     returning id`,
    [refFactura, d.admision_id, d.recaudo_id, val.ok ? 'enviando' : 'bloqueada', total, JSON.stringify(payload), JSON.stringify(val.hallazgos)],
  )
  if (!val.ok) {
    await marcarRevision(d.admision_id, `Factura SS-Recaudo bloqueada: ${val.errores.map((e) => e.codigo).join(', ')}`)
    throw new ErrorNoReintentable(`Validador bloqueó ${refFactura}: ${val.errores.map((e) => e.mensaje).join(' | ')}`)
  }

  const r = await factus().validarFactura(payload)
  await guardarResultado('facturas', factura!.id, r)

  if (r.ok && r.doc.is_validated) {
    await db.q(
      `update admisiones set estado = 'copago_facturado', nota_estado = null, updated_at = now()
       where id = $1 and estado in ('pagada', 'requiere_revision')`,
      [d.admision_id],
    )
    return
  }
  if (!r.ok && (r.status === 0 || r.status >= 500)) throw new Error(`Factus no disponible: ${r.mensaje}`) // se reintenta
  const motivo = r.ok ? 'La DIAN no validó la factura SS-Recaudo' : `Factus rechazó la SS-Recaudo: ${r.mensaje}`
  await marcarRevision(d.admision_id, motivo)
  throw new ErrorNoReintentable(motivo)
}

// ── SS-CUFE ────────────────────────────────────────────────────

async function datosAtencion(admisionId: number) {
  const a = await db.q1(
    `select a.id, a.codigo, a.estado, a.created_at, a.cerrada_en,
        c.numero as contrato_numero, c.modalidad_pago, c.cobertura, c.plazo_dias, c.metodo_pago, c.tarifas,
        e.nit, e.dv, e.razon_social, e.email_radicacion, e.municipio_codigo as eps_municipio
     from admisiones a join contratos c on c.id = a.contrato_id join eps e on e.id = c.eps_id
     where a.id = $1`,
    [admisionId],
  )
  if (!a) throw new ErrorNegocio(404, 'Atención no encontrada')
  const servicios = await db.q(
    `select codigo, nombre, cantidad, tarifa from admision_servicios where admision_id = $1 order by id`,
    [admisionId],
  )
  const recaudos = await db.q(
    `select r.id, r.reference_code, r.estado, r.monto, r.concepto, r.pagado_en,
        f.reference_code as factura_ref, f.estado as factura_estado
     from recaudos r left join facturas f on f.recaudo_id = r.id and f.tipo = 'SS-Recaudo'
     where r.admision_id = $1 order by r.id`,
    [admisionId],
  )
  return { a, servicios, recaudos }
}

/** Arma el payload SS-CUFE y su contexto de validación (sin enviar nada). */
export async function armarSsCufe(admisionId: number, opciones: OpcionesSsCufe = {}) {
  const { a, servicios, recaudos } = await datosAtencion(admisionId)
  const tarifas: Record<string, number> = Object.fromEntries(
    Object.entries((a.tarifas ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)]),
  )
  const recaudosPrevios = recaudos
    .filter((r) => r.estado === 'paid' && r.factura_estado === 'validada')
    .map((r) => ({
      referenciaFactura: r.factura_ref as string,
      referenciaRecaudo: r.reference_code as string,
      fecha: fechaColombia(new Date(r.pagado_en)),
      concepto: r.concepto,
      monto: Number(r.monto),
    }))
  const payload = construirSsCufe({
    atencionCodigo: codigoAtencion(a.codigo),
    servicios: servicios.map((s) => ({ codigo: s.codigo, nombre: s.nombre, cantidad: Number(s.cantidad), tarifa: Number(s.tarifa) })),
    contrato: {
      numero: a.contrato_numero,
      modalidad_pago: a.modalidad_pago,
      cobertura: a.cobertura,
      plazo_dias: Number(a.plazo_dias),
      metodo_pago: a.metodo_pago,
    },
    eps: { nit: a.nit, dv: a.dv, razon_social: a.razon_social, email_radicacion: a.email_radicacion, municipio_codigo: a.eps_municipio },
    recaudosPrevios,
    providerCode: env.ipsProviderCode,
    descontarPrepagos: env.cufeDescuentaPrepagos,
    fechaEmision: fechaColombia(),
    periodo: { inicio: new Date(a.created_at), fin: a.cerrada_en ? new Date(a.cerrada_en) : new Date() },
    opciones,
    numberingRangeId: env.factusRangoFacturas,
  })
  const ctx: Contexto = {
    tipo: 'ssCufe',
    recaudosAtencion: recaudos.map((r) => ({
      reference_code: r.reference_code,
      estado: r.estado,
      monto: Number(r.monto),
      facturaReferencia: r.factura_ref ?? null,
      facturaValidada: r.factura_estado === 'validada',
    })),
    tarifasContrato: tarifas,
    descontarPrepagos: env.cufeDescuentaPrepagos,
  }
  return { atencion: a, payload, ctx, recaudos }
}

/** Para POST /api/validaciones: corre el validador sin enviar. */
export async function previsualizarSsCufe(admisionId: number, opciones: OpcionesSsCufe = {}) {
  const { payload, ctx } = await armarSsCufe(admisionId, opciones)
  const resultado = validar(payload, ctx)
  await registrarValidacion({
    tipo: 'ssCufe',
    origen: 'previsualizacion',
    referencia: payload.reference_code,
    admisionId,
    resultado,
    valor: totalItems(payload.items),
  })
  return { payload, ...resultado }
}

const ESTADOS_PARA_FACTURAR_EPS = ['copago_facturado', 'atencion_cerrada', 'requiere_revision']

export async function emitirSsCufe(admisionId: number, opciones: OpcionesSsCufe = {}) {
  const { atencion, payload, ctx, recaudos } = await armarSsCufe(admisionId, opciones)
  if (['facturada_eps', 'glosada', 'pagada_eps'].includes(atencion.estado)) {
    const existente = await db.q1(`select * from facturas where admision_id = $1 and tipo = 'SS-CUFE'`, [admisionId])
    return { factura: existente, advertencias: [], ya_existia: true }
  }
  if (!ESTADOS_PARA_FACTURAR_EPS.includes(atencion.estado)) {
    throw new ErrorNegocio(409, `La atención está "${atencion.estado}": primero debe tener el copago pagado y facturado`)
  }

  const val = validar(payload, ctx)
  const total = totalItems(payload.items)
  // Lo que realmente debe pagar la EPS: total de servicios menos los copagos ya recaudados
  const prepagos = ((payload.prepayment_details ?? []) as any[]).reduce((s, p) => s + Number(p.amount), 0)
  const totalNeto = total - prepagos
  await registrarValidacion({ tipo: 'ssCufe', referencia: payload.reference_code, admisionId, resultado: val, valor: total })
  const factura = await db.q1<{ id: number }>(
    `insert into facturas (reference_code, tipo, admision_id, estado, total, total_neto, payload, errores_validacion)
     values ($1, 'SS-CUFE', $2, $3, $4, $5, $6, $7)
     on conflict (reference_code) do update set estado = excluded.estado, payload = excluded.payload,
       errores_validacion = excluded.errores_validacion, total = excluded.total, total_neto = excluded.total_neto,
       error_mensaje = null, updated_at = now()
     where facturas.estado <> 'validada'
     returning id`,
    [payload.reference_code, admisionId, val.ok ? 'enviando' : 'bloqueada', total, totalNeto, JSON.stringify(payload), JSON.stringify(val.hallazgos)],
  )
  if (!factura) {
    const existente = await db.q1(`select * from facturas where reference_code = $1`, [payload.reference_code])
    return { factura: existente, advertencias: [], ya_existia: true }
  }
  if (!val.ok) throw new ErrorValidacion(val.hallazgos, payload)

  await db.q(
    `update admisiones set estado = 'atencion_cerrada', cerrada_en = coalesce(cerrada_en, now()), updated_at = now()
     where id = $1 and estado = 'copago_facturado'`,
    [admisionId],
  )

  const r = await factus().validarFactura(payload)
  await guardarResultado('facturas', factura.id, r)

  if (r.ok && r.doc.is_validated) {
    for (const rec of recaudos.filter((x) => x.estado === 'paid' && x.factura_estado === 'validada')) {
      await db.q(`insert into factura_recaudos (factura_id, recaudo_id) values ($1, $2) on conflict do nothing`, [factura.id, rec.id])
    }
    await db.q(
      `update admisiones set estado = 'facturada_eps', nota_estado = null, updated_at = now() where id = $1`,
      [admisionId],
    )
    const guardada = await db.q1(`select * from facturas where id = $1`, [factura.id])
    return { factura: guardada, advertencias: val.advertencias, via: r.via }
  }

  const motivo = r.ok ? 'La DIAN no validó la factura SS-CUFE' : r.mensaje
  if (!r.ok && r.requiereRevision) await marcarRevision(admisionId, motivo)
  const guardada = await db.q1(`select * from facturas where id = $1`, [factura.id])
  throw new ErrorNegocio(502, `Factus no validó la factura a la EPS: ${motivo}`, { factura: guardada })
}

// ── Consultas y descargas ──────────────────────────────────────

export async function listarFacturas(filtro: { tipo?: string; estado?: string } = {}) {
  return db.q(
    `select f.id, f.reference_code, f.tipo, f.numero, f.cufe, f.estado, f.is_validated, f.total, f.total_neto,
        f.public_url, f.error_mensaje, f.created_at, f.admision_id, a.codigo as admision_codigo,
        e.razon_social as eps, f.payload -> 'items' as items
     from facturas f
     join admisiones a on a.id = f.admision_id
     join contratos c on c.id = a.contrato_id
     join eps e on e.id = c.eps_id
     where ($1::text is null or f.tipo = $1) and ($2::text is null or f.estado = $2)
     order by f.id desc limit 100`,
    [filtro.tipo ?? null, filtro.estado ?? null],
  )
}

export async function descargarDocumento(tipo: TipoDocumento, id: number, formato: 'pdf' | 'xml') {
  const tabla = tipo === 'factura' ? 'facturas' : 'notas_credito'
  const fila = await db.q1<{ numero: string | null }>(`select numero from ${tabla} where id = $1`, [id])
  if (!fila) throw new ErrorNegocio(404, 'Documento no encontrado')
  if (!fila.numero) throw new ErrorNegocio(409, 'El documento todavía no tiene número de Factus')
  const { nombre, base64 } = await factus().descargar(tipo, fila.numero, formato)
  return {
    nombre,
    contenido: Buffer.from(base64, 'base64'),
    tipoMime: formato === 'pdf' ? 'application/pdf' : 'application/xml',
  }
}
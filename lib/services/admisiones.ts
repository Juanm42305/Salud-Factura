// Admisiones (= atenciones): registro del paciente en caja, cálculo del copago y consulta de estado.
import { calcularRecaudo } from '../copago'
import { db } from '../db'
import { ErrorNegocio } from '../errores'
import { CONCEPTOS_RECAUDO, type ConceptoRecaudo } from '../validation/tablas'
import { codigoAdmision, codigoAtencion } from './referencias'

export interface NuevaAdmision {
  paciente_id: number
  contrato_id: number
  concepto?: ConceptoRecaudo
  servicios: { codigo: string; cantidad?: number; tarifa?: number }[]
}

export async function crearAdmision(datos: NuevaAdmision) {
  const concepto: ConceptoRecaudo = datos.concepto ?? 'CUO'
  if (!CONCEPTOS_RECAUDO.includes(concepto)) throw new ErrorNegocio(400, 'concepto debe ser COP, CUO o PAC')
  if (!Number.isInteger(datos.paciente_id) || !Number.isInteger(datos.contrato_id))
    throw new ErrorNegocio(400, 'paciente_id y contrato_id son obligatorios')
  if (!Array.isArray(datos.servicios) || datos.servicios.length === 0)
    throw new ErrorNegocio(400, 'Agrega al menos un servicio')

  return db.tx(async (c) => {
    const paciente = await c.q1(`select id, categoria from pacientes where id = $1`, [datos.paciente_id])
    if (!paciente) throw new ErrorNegocio(404, 'Paciente no encontrado')
    const contrato = await c.q1(`select id, tarifas, cuotas from contratos where id = $1 and activo`, [datos.contrato_id])
    if (!contrato) throw new ErrorNegocio(404, 'Contrato no encontrado o inactivo')

    const codigos = datos.servicios.map((s) => s.codigo)
    const catalogo = await c.q(`select codigo, nombre from servicios where codigo = any($1)`, [codigos])
    const nombres = new Map(catalogo.map((s) => [s.codigo, s.nombre]))
    const tarifas = (contrato.tarifas ?? {}) as Record<string, number>

    const lineas = datos.servicios.map((s) => {
      const nombre = nombres.get(s.codigo)
      if (!nombre) throw new ErrorNegocio(400, `Servicio ${s.codigo} no existe en el catálogo`)
      const tarifa = s.tarifa ?? tarifas[s.codigo]
      if (tarifa === undefined) throw new ErrorNegocio(400, `El servicio ${s.codigo} no tiene tarifa en el contrato`)
      const cantidad = s.cantidad ?? 1
      if (!(cantidad > 0)) throw new ErrorNegocio(400, 'La cantidad debe ser mayor a cero')
      return { codigo: s.codigo, nombre, cantidad, tarifa: Number(tarifa) }
    })
    const total = lineas.reduce((s, l) => s + l.cantidad * l.tarifa, 0)
    const monto = calcularRecaudo(contrato.cuotas, concepto, paciente.categoria, total)

    const adm = await c.q1<{ id: number }>(
      `insert into admisiones (paciente_id, contrato_id, concepto_recaudo, monto_recaudo) values ($1, $2, $3, $4) returning id`,
      [datos.paciente_id, datos.contrato_id, concepto, monto],
    )
    const codigo = codigoAdmision(adm!.id)
    await c.q(`update admisiones set codigo = $1 where id = $2`, [codigo, adm!.id])
    for (const l of lineas) {
      await c.q(
        `insert into admision_servicios (admision_id, codigo, nombre, cantidad, tarifa) values ($1, $2, $3, $4, $5)`,
        [adm!.id, l.codigo, l.nombre, l.cantidad, l.tarifa],
      )
    }
    return { id: adm!.id, codigo, monto_recaudo: monto, concepto, total_servicios: total }
  })
}

export async function obtenerAdmision(id: number) {
  const a = await db.q1(
    `select a.*, p.nombres, p.apellidos, p.tipo_doc_salud, p.numero_doc, p.categoria,
        c.numero as contrato_numero, c.cobertura, c.modalidad_pago, e.razon_social as eps
     from admisiones a
     join pacientes p on p.id = a.paciente_id
     join contratos c on c.id = a.contrato_id
     join eps e on e.id = c.eps_id
     where a.id = $1`,
    [id],
  )
  if (!a) throw new ErrorNegocio(404, 'Admisión no encontrada')
  const [servicios, recaudos, facturas, notas] = await Promise.all([
    db.q(`select codigo, nombre, cantidad, tarifa from admision_servicios where admision_id = $1 order by id`, [id]),
    db.q(
      `select id, reference_code, concepto, intento, monto, estado, breb_key, qr, qr_expira, pagado_en, origen_confirmacion
       from recaudos where admision_id = $1 order by intento`,
      [id],
    ),
    db.q(
      `select id, reference_code, tipo, numero, cufe, is_validated, estado, total, total_neto, public_url,
          errores_validacion, error_mensaje, updated_at
       from facturas where admision_id = $1 order by id`,
      [id],
    ),
    db.q(
      `select n.id, n.reference_code, n.numero, n.cude, n.estado, n.total, n.error_mensaje, n.glosa_id
       from notas_credito n join facturas f on f.id = n.factura_id where f.admision_id = $1 order by n.id`,
      [id],
    ),
  ])
  const total_servicios = servicios.reduce((s, x) => s + Number(x.cantidad) * Number(x.tarifa), 0)
  return { ...a, atencion_codigo: a.codigo ? codigoAtencion(a.codigo) : null, total_servicios, servicios, recaudos, facturas, notas }
}

export async function listarAdmisiones(estados?: string[]) {
  return db.q(
    `select a.id, a.codigo, a.estado, a.nota_estado, a.concepto_recaudo, a.monto_recaudo, a.created_at,
        p.nombres || ' ' || p.apellidos as paciente, e.razon_social as eps, c.numero as contrato,
        (select coalesce(sum(s.cantidad * s.tarifa), 0) from admision_servicios s where s.admision_id = a.id) as total_servicios
     from admisiones a
     join pacientes p on p.id = a.paciente_id
     join contratos c on c.id = a.contrato_id
     join eps e on e.id = c.eps_id
     where ($1::text[] is null or a.estado = any($1::text[]))
     order by a.id desc limit 50`,
    [estados && estados.length ? estados : null],
  )
}

export async function catalogos() {
  const [pacientes, contratos, servicios] = await Promise.all([
    db.q(
      `select id, tipo_doc_salud, numero_doc, nombres, apellidos, categoria from pacientes order by id`,
    ),
    db.q(
      `select c.id, c.numero, c.cobertura, c.modalidad_pago, c.plazo_dias, c.esquema_recaudo, c.tarifas, c.cuotas,
          e.razon_social as eps
       from contratos c join eps e on e.id = c.eps_id where c.activo order by e.razon_social`,
    ),
    db.q(`select codigo, nombre from servicios order by codigo`),
  ])
  return { pacientes, contratos, servicios }
}

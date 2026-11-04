// Factura SS-CUFE a la EPS: total de servicios con los copagos ya facturados en prepayment_details.
import { CONCEPTO_PREPAGO, type ConceptoRecaudo } from '../validation/tablas'
import { dinero, fechaColombia, horaColombia, recortar, sumarDias, totalItems } from './comun'

export interface RecaudoPrevio {
  referenciaFactura: string // FV-ADM-...-COP (factura SS-Recaudo validada)
  referenciaRecaudo: string // ADM-...-COP (Factus Pay)
  fecha: string // YYYY-MM-DD en que se recaudó
  concepto: ConceptoRecaudo
  monto: number
}

export interface OpcionesSsCufe {
  /** Para la demo: facturar sin el número de contrato (el validador bloquea si no hay causal). */
  sinContrato?: boolean
  withoutContractCode?: string
  policyNumber?: string
}

export interface DatosSsCufe {
  atencionCodigo: string // ATN-2026-000123
  servicios: { codigo: string; nombre: string; cantidad: number; tarifa: number }[]
  contrato: { numero: string; modalidad_pago: string; cobertura: string; plazo_dias: number; metodo_pago?: string }
  eps: { nit: string; dv: string; razon_social: string; email_radicacion?: string | null; municipio_codigo: string }
  recaudosPrevios: RecaudoPrevio[]
  providerCode: string
  descontarPrepagos: boolean
  fechaEmision: string // YYYY-MM-DD
  /** Periodo de la atención (Factus lo exige en SS-CUFE): de la admisión al cierre. */
  periodo?: { inicio: Date; fin: Date }
  opciones?: OpcionesSsCufe
  numberingRangeId?: number | null
}

export const referenciaFacturaEps = (atencionCodigo: string) => `FV-${atencionCodigo}-EPS`

export function construirSsCufe(d: DatosSsCufe): Record<string, any> {
  const o = d.opciones ?? {}
  const items = d.servicios.map((s) => ({
    code_reference: s.codigo,
    name: s.nombre,
    quantity: dinero(s.cantidad),
    discount_rate: '0.00',
    price: dinero(s.tarifa),
    unit_measure_code: '94',
    standard_code: '999',
    taxes: [{ is_excluded: true }],
  }))
  const total = totalItems(items)
  const previos = d.recaudosPrevios.reduce((s, r) => s + r.monto, 0)

  const health: Record<string, string> = {
    provider_code: d.providerCode,
    payment_method_code: d.contrato.modalidad_pago,
    coverage_code: d.contrato.cobertura,
  }
  if (!o.sinContrato) health.contract_number = d.contrato.numero
  if (o.withoutContractCode) health.without_contract_code = o.withoutContractCode
  if (o.policyNumber) health.policy_number = o.policyNumber

  const refsCopago = d.recaudosPrevios.map((r) => r.referenciaFactura)
  const billing_period = d.periodo
    ? {
        start_date: fechaColombia(d.periodo.inicio),
        start_time: horaColombia(d.periodo.inicio),
        end_date: fechaColombia(d.periodo.fin),
        end_time: horaColombia(d.periodo.fin),
      }
    : { start_date: d.fechaEmision, start_time: '00:00:00', end_date: d.fechaEmision, end_time: '23:59:59' }

  const payload: Record<string, any> = {
    reference_code: referenciaFacturaEps(d.atencionCodigo),
    document: '01',
    operation_type: 'SS-CUFE',
    send_email: false,
    billing_period,
    observation: recortar(
      refsCopago.length
        ? `Atención ${d.atencionCodigo}. Copago facturado en ${refsCopago.join(', ')}`
        : `Atención ${d.atencionCodigo}. Sin recaudos previos`,
    ),
    health,
    payment_details: [
      {
        payment_form: 2,
        payment_method_code: d.contrato.metodo_pago ?? '47',
        amount: dinero(d.descontarPrepagos ? total - previos : total),
        due_date: sumarDias(d.fechaEmision, d.contrato.plazo_dias),
      },
    ],
    customer: {
      identification_document_code: '31',
      identification: d.eps.nit,
      dv: d.eps.dv,
      legal_organization_code: '1',
      company: d.eps.razon_social,
      tribute_code: 'ZZ',
      ...(d.eps.email_radicacion ? { email: d.eps.email_radicacion } : {}),
      municipality_code: d.eps.municipio_codigo,
    },
    items,
  }
  if (d.recaudosPrevios.length) {
    payload.prepayment_details = d.recaudosPrevios.map((r) => ({
      reference_code: r.referenciaFactura,
      received_date: r.fecha,
      concept_code: CONCEPTO_PREPAGO[r.concepto],
      amount: dinero(r.monto),
      note: `Recaudado por Factus Pay ${r.referenciaRecaudo}`,
    }))
  }
  if (d.numberingRangeId) payload.numbering_range_id = d.numberingRangeId
  return payload
}
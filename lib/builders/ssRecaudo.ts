// Factura SS-Recaudo: el copago / cuota moderadora que pagó el paciente por Factus Pay.
import { DOC_SALUD_A_DIAN, NOMBRE_CONCEPTO, type ConceptoRecaudo } from '../validation/tablas'
import { dinero, recortar } from './comun'

export interface DatosSsRecaudo {
  admisionCodigo: string
  recaudo: { reference_code: string; monto: number; concepto: ConceptoRecaudo }
  paciente: {
    tipo_doc_salud: string
    numero_doc: string | null
    nombres: string
    apellidos: string
    email?: string | null
    telefono?: string | null
    direccion?: string | null
    municipio_codigo: string
  }
  esquemaRecaudo: 0 | 1 // 0 ingreso propio de la IPS; 1 recaudo para la EPS (mandato)
  eps: { nit: string }
  servicio: { codigo: string; nombre: string }
  numberingRangeId?: number | null
  /** Código de "Métodos de pago" para el QR Bre-B. 47 = transferencia. */
  metodoPago?: string
}

export const referenciaFacturaRecaudo = (referenciaRecaudo: string) => `FV-${referenciaRecaudo}`

export function construirSsRecaudo(d: DatosSsRecaudo): Record<string, any> {
  const { paciente: p, recaudo: r } = d
  const nombreCompleto = `${p.nombres} ${p.apellidos}`.trim()
  const codigoDian = DOC_SALUD_A_DIAN[p.tipo_doc_salud]
  // Paciente sin documento (SI, MS, AS): se factura a consumidor final
  const customer =
    codigoDian && p.numero_doc
      ? {
          identification_document_code: codigoDian,
          identification: p.numero_doc,
          names: nombreCompleto,
          address: p.direccion ?? undefined,
          email: p.email ?? undefined,
          phone: p.telefono ?? undefined,
          legal_organization_code: '2',
          tribute_code: 'ZZ',
          municipality_code: p.municipio_codigo,
        }
      : {
          identification_document_code: '13',
          identification: '222222222222',
          names: 'Consumidor final',
          legal_organization_code: '2',
          tribute_code: 'ZZ',
          municipality_code: p.municipio_codigo,
        }

  const item: Record<string, any> = {
    scheme_id: d.esquemaRecaudo,
    collection_concept_code: r.concepto,
    code_reference: `${r.concepto}-${d.servicio.codigo}`,
    name: `${NOMBRE_CONCEPTO[r.concepto]} ${d.servicio.nombre.charAt(0).toLowerCase()}${d.servicio.nombre.slice(1)}`,
    quantity: '1.00',
    discount_rate: '0.00',
    price: dinero(r.monto),
    unit_measure_code: '94',
    standard_code: '999',
    taxes: [{ is_excluded: true }],
  }
  if (d.esquemaRecaudo === 1) {
    item.mandate = { identification_document_code: '31', identification: d.eps.nit }
  }

  const payload: Record<string, any> = {
    reference_code: referenciaFacturaRecaudo(r.reference_code),
    document: '01',
    operation_type: 'SS-Recaudo',
    send_email: false,
    observation: recortar(`${NOMBRE_CONCEPTO[r.concepto]} admisión ${d.admisionCodigo}. Recaudo Factus Pay ${r.reference_code}`),
    payment_details: [
      {
        payment_form: 1,
        payment_method_code: d.metodoPago ?? '47',
        reference_code: r.reference_code,
        amount: dinero(r.monto),
      },
    ],
    beneficiary: {
      identification_document_code: p.tipo_doc_salud,
      identification_number: p.numero_doc ?? '',
      names: p.nombres,
      surnames: p.apellidos,
    },
    customer: JSON.parse(JSON.stringify(customer)), // quita los undefined
    items: [item],
  }
  if (d.numberingRangeId) payload.numbering_range_id = d.numberingRangeId
  return payload
}

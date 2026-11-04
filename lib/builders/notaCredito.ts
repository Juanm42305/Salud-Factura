// Nota crédito por glosa aceptada, ligada a la factura SS-CUFE.
// Los nombres de campos siguen developers.factus.com.co/notas-credito/crear-y-validar (v2).
import { CONCEPTO_CORRECCION, type TipoGlosa } from '../validation/tablas'
import { dinero, recortar } from './comun'

export interface DatosNotaCredito {
  factura: { numero: string; reference_code: string; payload: Record<string, any> }
  glosa: { id: number; consecutivo: number; tipo: TipoGlosa; item: string | null; valor: number; motivo: string }
  numberingRangeId?: number | null
}

export const referenciaNotaCredito = (refFactura: string, consecutivo: number) =>
  `NC-${refFactura}-${String(consecutivo).padStart(2, '0')}`

export function construirNotaCredito(d: DatosNotaCredito): Record<string, any> {
  const original = d.factura.payload ?? {}
  const itemsOriginales = (original.items ?? []) as Record<string, any>[]
  const concepto = CONCEPTO_CORRECCION[d.glosa.tipo]

  let items: Record<string, any>[]
  if (d.glosa.tipo === 'factura_rechazada') {
    // Anulación: se reversan todos los ítems
    items = itemsOriginales.map((i) => ({ ...i }))
  } else {
    const base = itemsOriginales.find((i) => i.code_reference === d.glosa.item) ?? itemsOriginales[0] ?? {}
    items = [
      {
        code_reference: base.code_reference ?? 'GLOSA',
        name: recortar(`Glosa ${d.glosa.consecutivo}: ${base.name ?? 'servicio'}`, 200),
        quantity: '1.00',
        discount_rate: '0.00',
        price: dinero(d.glosa.valor),
        unit_measure_code: base.unit_measure_code ?? '94',
        standard_code: base.standard_code ?? '999',
        taxes: [{ is_excluded: true }],
      },
    ]
  }
  const total = items.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0)
  const metodo = original.payment_details?.[0]?.payment_method_code ?? '47'

  const payload: Record<string, any> = {
    reference_code: referenciaNotaCredito(d.factura.reference_code, d.glosa.consecutivo),
    correction_concept_code: concepto,
    customization_id: '20', // nota crédito que referencia una factura electrónica
    bill_number: d.factura.numero,
    observation: recortar(`Glosa #${d.glosa.id} aceptada (${d.glosa.tipo.replace(/_/g, ' ')}): ${d.glosa.motivo}`),
    payment_details: [{ payment_form: 1, payment_method_code: metodo, amount: dinero(total) }],
    items,
  }
  if (original.health) payload.health = { ...original.health }
  if (d.numberingRangeId) payload.numbering_range_id = d.numberingRangeId
  return payload
}

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dvNit, sumarDias, totalItems } from '../lib/builders/comun'
import { construirNotaCredito } from '../lib/builders/notaCredito'
import { construirSsCufe } from '../lib/builders/ssCufe'
import { construirSsRecaudo } from '../lib/builders/ssRecaudo'
import { calcularRecaudo } from '../lib/copago'
import { parsearFechaFactus, referenciaRecaudo } from '../lib/services/referencias'
import { redactar } from '../lib/logger'
import { llaveValida } from '../lib/services/webhook'

describe('utilidades', () => {
  it('DV del NIT (DIAN 800197268-4)', () => assert.equal(dvNit('800197268'), '4'))
  it('suma de ítems y plazo de pago', () => {
    assert.equal(totalItems([{ quantity: '2', price: '1000.50', discount_rate: '10' }]), 1800.9)
    assert.equal(sumarDias('2026-11-04', 30), '2026-12-04')
  })
  it('fecha de Factus Pay en hora Colombia', () => {
    assert.equal(parsearFechaFactus('28-10-2026 08:23:04 PM')!.toISOString(), '2026-10-29T01:23:04.000Z')
    assert.equal(parsearFechaFactus('04-11-2026 12:05:00 AM')!.toISOString(), '2026-11-04T05:05:00.000Z')
  })
  it('referencias y copago', () => {
    assert.equal(referenciaRecaudo('ADM-2026-000123', 'COP'), 'ADM-2026-000123-COP')
    assert.equal(referenciaRecaudo('ADM-2026-000123', 'COP', 2), 'ADM-2026-000123-COP-2')
    assert.equal(calcularRecaudo({ CUO: { A: 4700 } }, 'CUO', 'A', 63500), 4700)
    assert.equal(calcularRecaudo({ COP: { C: 0.23 } }, 'COP', 'C', 62000), 14300)
  })
  it('el logger no imprime secretos', () => {
    const r = JSON.stringify(redactar({ url: 'https://x/webhooks/factus-pay?key=SECRETO', password: 'p', client_secret: 's', h: 'Bearer 1|abc' }))
    assert.ok(!r.includes('SECRETO') && !r.includes('1|abc') && !r.includes('"p"'))
  })
  it('llave del webhook en tiempo constante', () => {
    assert.equal(llaveValida('a'.repeat(40), 'a'.repeat(40)), true)
    assert.equal(llaveValida('a', 'a'.repeat(40)), false)
    assert.equal(llaveValida(null, 'x'), false)
    assert.equal(llaveValida('x', ''), false)
  })
})

describe('builders', () => {
  it('SS-Recaudo coincide con la especificación (sección 7.2)', () => {
    const p = construirSsRecaudo({
      admisionCodigo: 'ADM-2026-000123',
      recaudo: { reference_code: 'ADM-2026-000123-COP', monto: 4700, concepto: 'COP' },
      paciente: { tipo_doc_salud: 'CC', numero_doc: '1234567890', nombres: 'Ana María', apellidos: 'Pérez Gómez', email: 'paciente@correo.com', telefono: '3000000000', direccion: 'Calle 1 # 1-1', municipio_codigo: '23001' },
      esquemaRecaudo: 0,
      eps: { nit: '900123456' },
      servicio: { codigo: '890201', nombre: 'Consulta medicina general' },
      numberingRangeId: 8,
    })
    assert.equal(p.reference_code, 'FV-ADM-2026-000123-COP')
    assert.equal(p.operation_type, 'SS-Recaudo')
    assert.equal(p.numbering_range_id, 8)
    assert.deepEqual(p.payment_details, [{ payment_form: 1, payment_method_code: '47', reference_code: 'ADM-2026-000123-COP', amount: '4700.00' }])
    assert.deepEqual(p.beneficiary, { identification_document_code: 'CC', identification_number: '1234567890', names: 'Ana María', surnames: 'Pérez Gómez' })
    assert.equal(p.customer.identification_document_code, '13')
    assert.equal(p.customer.legal_organization_code, '2')
    assert.deepEqual(p.items[0].taxes, [{ is_excluded: true }])
    assert.equal(p.items[0].scheme_id, 0)
    assert.equal(p.items[0].mandate, undefined)
  })
  it('SS-CUFE descuenta el copago y lleva health completo', () => {
    const p = construirSsCufe({
      atencionCodigo: 'ATN-2026-000123',
      servicios: [{ codigo: '890201', nombre: 'Consulta', cantidad: 1, tarifa: 45000 }],
      contrato: { numero: 'CTO-EPS-2026-045', modalidad_pago: '04', cobertura: '16', plazo_dias: 30 },
      eps: { nit: '900123456', dv: '8', razon_social: 'EPS Andina', email_radicacion: 'radicacion@eps.com', municipio_codigo: '11001' },
      recaudosPrevios: [{ referenciaFactura: 'FV-ADM-2026-000123-COP', referenciaRecaudo: 'ADM-2026-000123-COP', fecha: '2026-11-04', concepto: 'COP', monto: 4700 }],
      providerCode: '2300100001',
      descontarPrepagos: true,
      fechaEmision: '2026-11-04',
    })
    assert.equal(p.reference_code, 'FV-ATN-2026-000123-EPS')
    assert.deepEqual(p.health, { provider_code: '2300100001', payment_method_code: '04', coverage_code: '16', contract_number: 'CTO-EPS-2026-045' })
    assert.equal(p.prepayment_details[0].concept_code, '01')
    assert.equal(p.payment_details[0].amount, '40300.00')
    assert.equal(p.payment_details[0].due_date, '2026-12-04')
    assert.equal(p.customer.company, 'EPS Andina')
  })
  it('nota crédito por diferencia de tarifa', () => {
    const n = construirNotaCredito({
      factura: { numero: 'SETP990000010', reference_code: 'FV-ATN-2026-000123-EPS', payload: { items: [{ code_reference: '890201', name: 'Consulta', price: '45000.00', quantity: '1.00', unit_measure_code: '94', standard_code: '999' }], health: { provider_code: 'x' } } },
      glosa: { id: 7, consecutivo: 1, tipo: 'diferencia_tarifa', item: '890201', valor: 5000, motivo: 'Tarifa' },
    })
    assert.equal(n.reference_code, 'NC-FV-ATN-2026-000123-EPS-01')
    assert.equal(n.correction_concept_code, '4')
    assert.equal(n.bill_number, 'SETP990000010')
    assert.equal(n.items[0].price, '5000.00')
  })
})

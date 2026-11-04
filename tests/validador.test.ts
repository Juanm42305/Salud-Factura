import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { construirSsCufe } from '../lib/builders/ssCufe'
import { construirSsRecaudo } from '../lib/builders/ssRecaudo'
import { validar } from '../lib/validation'

const codigos = (r: { hallazgos: { codigo: string }[] }) => r.hallazgos.map((h) => h.codigo)

const recaudoOk = () =>
  construirSsRecaudo({
    admisionCodigo: 'ADM-2026-000123',
    recaudo: { reference_code: 'ADM-2026-000123-COP', monto: 4700, concepto: 'COP' },
    paciente: { tipo_doc_salud: 'CC', numero_doc: '1234567890', nombres: 'Ana María', apellidos: 'Pérez Gómez', municipio_codigo: '23001' },
    esquemaRecaudo: 0,
    eps: { nit: '900123456' },
    servicio: { codigo: '890201', nombre: 'Consulta de primera vez por medicina general' },
  })

const cufeOk = (opciones = {}) =>
  construirSsCufe({
    atencionCodigo: 'ATN-2026-000123',
    servicios: [{ codigo: '890201', nombre: 'Consulta', cantidad: 1, tarifa: 45000 }],
    contrato: { numero: 'CTO-EPS-2026-045', modalidad_pago: '04', cobertura: '16', plazo_dias: 30 },
    eps: { nit: '900123456', dv: '8', razon_social: 'EPS Andina', municipio_codigo: '11001' },
    recaudosPrevios: [{ referenciaFactura: 'FV-ADM-2026-000123-COP', referenciaRecaudo: 'ADM-2026-000123-COP', fecha: '2026-11-04', concepto: 'COP', monto: 4700 }],
    providerCode: '2300100001',
    descontarPrepagos: true,
    fechaEmision: '2026-11-04',
    opciones,
  })

const ctxCufe = {
  tipo: 'ssCufe' as const,
  descontarPrepagos: true,
  tarifasContrato: { '890201': 45000 },
  recaudosAtencion: [{ reference_code: 'ADM-2026-000123-COP', estado: 'paid', monto: 4700, facturaReferencia: 'FV-ADM-2026-000123-COP', facturaValidada: true }],
}

describe('Recaudo Factus Pay (V01, V02)', () => {
  it('acepta un monto válido', () => assert.equal(validar({ reference_code: 'ADM-1-COP', amount: '18800' }, { tipo: 'recaudoPay' }).ok, true))
  it('V01: menos de $1.000 no se cobra por QR', () => assert.deepEqual(codigos(validar({ reference_code: 'X', amount: '900' }, { tipo: 'recaudoPay' })), ['V01']))
  it('V01: más de $12.100.000', () => assert.deepEqual(codigos(validar({ reference_code: 'X', amount: '12100001' }, { tipo: 'recaudoPay' })), ['V01']))
  it('V02: referencia de más de 100 caracteres o repetida', () => {
    assert.deepEqual(codigos(validar({ reference_code: 'x'.repeat(101), amount: '15000' }, { tipo: 'recaudoPay' })), ['V02'])
    assert.deepEqual(codigos(validar({ reference_code: 'X', amount: '15000' }, { tipo: 'recaudoPay', referenciaDuplicada: true })), ['V02'])
  })
})

describe('SS-Recaudo (V03–V11)', () => {
  it('el payload armado pasa limpio', () => {
    const r = validar(recaudoOk(), { tipo: 'ssRecaudo', recaudo: { estado: 'paid', monto: 4700 } })
    assert.deepEqual(r.hallazgos, [])
  })
  it('V11: recaudo sin pagar o con monto distinto', () => {
    assert.ok(codigos(validar(recaudoOk(), { tipo: 'ssRecaudo', recaudo: { estado: 'ready', monto: 4700 } })).includes('V11'))
    assert.ok(codigos(validar(recaudoOk(), { tipo: 'ssRecaudo', recaudo: { estado: 'paid', monto: 5000 } })).includes('V11'))
  })
  it('V07, V08: beneficiario del sector salud con número', () => {
    const p = recaudoOk()
    p.beneficiary.identification_document_code = '13'
    assert.ok(codigos(validar(p, { tipo: 'ssRecaudo', recaudo: { estado: 'paid', monto: 4700 } })).includes('V07'))
    const q = recaudoOk()
    q.beneficiary.identification_number = ''
    assert.ok(codigos(validar(q, { tipo: 'ssRecaudo', recaudo: { estado: 'paid', monto: 4700 } })).includes('V08'))
    q.beneficiary.identification_document_code = 'MS' // menor sin identificar: no exige número
    assert.ok(!codigos(validar(q, { tipo: 'ssRecaudo', recaudo: { estado: 'paid', monto: 4700 } })).includes('V08'))
  })
  it('V09, V10: concepto de recaudo y mandato', () => {
    const p = recaudoOk()
    p.items[0].collection_concept_code = 'XXX'
    p.items[0].scheme_id = 1
    const c = codigos(validar(p, { tipo: 'ssRecaudo', recaudo: { estado: 'paid', monto: 4700 } }))
    assert.ok(c.includes('V09') && c.includes('V10'))
  })
  it('V03, V04, V18, V19: pagos, cliente, observación y decimales', () => {
    const p = recaudoOk()
    p.payment_details[0].amount = '9000.00'
    p.customer.names = ''
    p.observation = 'x'.repeat(501)
    p.items[0].price = '4700.123'
    const c = codigos(validar(p, { tipo: 'ssRecaudo', recaudo: { estado: 'paid', monto: 4700 } }))
    for (const v of ['V03', 'V04', 'V18', 'V19']) assert.ok(c.includes(v), v)
  })
})

describe('SS-CUFE (V12–V17)', () => {
  it('con contrato y copago descontado pasa limpio', () => assert.deepEqual(validar(cufeOk(), ctxCufe).hallazgos, []))
  it('V13: sin contrato ni causal se bloquea; con causal pasa', () => {
    assert.deepEqual(codigos(validar(cufeOk({ sinContrato: true }), ctxCufe)), ['V13'])
    assert.equal(validar(cufeOk({ sinContrato: true, withoutContractCode: '01' }), ctxCufe).ok, true)
  })
  it('V12: falta código de habilitación o tabla inválida', () => {
    const p = cufeOk()
    p.health.provider_code = ''
    p.health.coverage_code = '99'
    assert.equal(validar(p, ctxCufe).errores.filter((e) => e.codigo === 'V12').length, 2)
  })
  it('V14: SOAT exige póliza', () => {
    const p = cufeOk()
    p.health.coverage_code = '04'
    assert.ok(codigos(validar(p, ctxCufe)).includes('V14'))
  })
  it('V15: copago pagado que no se descuenta', () => {
    const p = cufeOk()
    delete p.prepayment_details
    p.payment_details[0].amount = '45000.00'
    assert.ok(codigos(validar(p, ctxCufe)).includes('V15'))
  })
  it('V16: copago todavía pendiente', () => {
    const ctx = { ...ctxCufe, recaudosAtencion: [...ctxCufe.recaudosAtencion, { reference_code: 'ADM-2026-000123-COP-2', estado: 'ready', monto: 4700 }] }
    assert.ok(codigos(validar(cufeOk(), ctx)).includes('V16'))
  })
  it('V17: tarifa distinta es advertencia, no bloquea', () => {
    const r = validar(cufeOk(), { ...ctxCufe, tarifasContrato: { '890201': 40000 } })
    assert.equal(r.ok, true)
    assert.deepEqual(r.advertencias.map((h) => h.codigo), ['V17'])
  })
  it('V05, V06: NIT con DV pegado y crédito sin vencimiento', () => {
    const p = cufeOk()
    p.customer.identification = '9001234568'
    delete p.payment_details[0].due_date
    const c = codigos(validar(p, ctxCufe))
    assert.ok(c.includes('V05') && c.includes('V06'))
  })
})

describe('Nota crédito (V20)', () => {
  it('no supera el saldo de la factura', () => {
    const nota = { items: [{ quantity: '1.00', price: '60000.00' }], payment_details: [{ payment_form: 1, amount: '60000.00' }] }
    assert.deepEqual(codigos(validar(nota, { tipo: 'notaCredito', saldoFactura: 45000 })), ['V20'])
    assert.equal(validar(nota, { tipo: 'notaCredito', saldoFactura: 60000 }).ok, true)
  })
})

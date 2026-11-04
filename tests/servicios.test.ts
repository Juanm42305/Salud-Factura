// Pruebas de los servicios con una base Postgres en memoria y las APIs de Factus simuladas:
// webhook de Factus Pay (sección 6.3), idempotencia (11.2) y estados de la admisión (11.5).
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

process.env.FACTUS_MOCK = 'true'
process.env.FACTUS_PAY_MOCK = 'true'
process.env.FACTUS_PAY_WEBHOOK_KEY = 'llave-de-prueba-0123456789abcdef0123'
process.env.REFERENCIA_EQUIPO = 'PRUEBA'

import { db } from '../lib/db'
import { setApis } from '../lib/factus'
import { MockFactusApi } from '../lib/factus/factusMock'
import { MockPayApi } from '../lib/factus/payMock'
import { crearAdmision } from '../lib/services/admisiones'
import { confirmarPago, crearCobro, reconciliarRecaudo } from '../lib/services/cobros'
import { procesarJobs } from '../lib/services/jobs'
import { procesarWebhookFactusPay } from '../lib/services/webhook'
import { baseEnMemoria } from './baseMemoria'

const LLAVE = process.env.FACTUS_PAY_WEBHOOK_KEY!
const urlWebhook = (key = LLAVE) => new URL(`https://app.test/webhooks/factus-pay?key=${encodeURIComponent(key)}`)
const avisoPago = (reference_code: string, amount: number | string, status = 'paid') =>
  JSON.stringify({ event: 'collection.paid', data: { reference_code, amount: String(amount), status } })

let pay: MockPayApi

beforeEach(async () => {
  await baseEnMemoria()
  // Los simuladores guardan su estado en globalThis (para sobrevivir recargas de next dev): se limpia por prueba
  const g = globalThis as Record<string, unknown>
  delete g.__sfPayMock
  delete g.__sfFactusMock
  pay = new MockPayApi()
  setApis({ pay, factus: new MockFactusApi() })
})

async function admisionDemo() {
  const paciente = await db.q1(`select id from pacientes where numero_doc = '1234567890'`) // categoría A
  const contrato = await db.q1(`select id from contratos where numero = 'CTO-EPS-2026-045'`)
  return crearAdmision({ paciente_id: paciente.id, contrato_id: contrato.id, concepto: 'CUO', servicios: [{ codigo: '890201' }] })
}

async function admisionConCobro() {
  const adm = await admisionDemo()
  await crearCobro(adm.id)
  const r = await db.q1(`select reference_code, monto from recaudos where admision_id = $1`, [adm.id])
  return { adm, referencia: r.reference_code as string, monto: Number(r.monto) }
}

const estadoAdmision = async (id: number) => (await db.q1(`select estado from admisiones where id = $1`, [id])).estado
const cuantos = async (sql: string, params: unknown[] = []) => Number((await db.q1(`select count(*)::int as n ${sql}`, params)).n)

describe('Admisión y cobro', () => {
  it('calcula la cuota moderadora del contrato y usa el prefijo del equipo', async () => {
    const adm = await admisionDemo()
    // Cuota moderadora (CUO) de la categoría A en el contrato del seed: se lee del contrato, no se fija aquí
    const c = await db.q1(`select cuotas from contratos where numero = 'CTO-EPS-2026-045'`)
    assert.equal(adm.monto_recaudo, c.cuotas.CUO.A)
    assert.ok(adm.monto_recaudo >= 10000, 'el sandbox de Factus Pay exige un cobro mínimo de $10.000')
    assert.match(adm.codigo, /^ADM-PRUEBA-\d{4}-\d{6}$/)
    assert.equal(await estadoAdmision(adm.id), 'creada')
  })

  it('crear el cobro deja el recaudo en Factus Pay y la admisión en cobro_pendiente', async () => {
    const { adm, referencia } = await admisionConCobro()
    assert.match(referencia, /^ADM-PRUEBA-\d{4}-\d{6}-CUO$/)
    assert.equal(await estadoAdmision(adm.id), 'cobro_pendiente')
  })

  it('pedir el cobro dos veces no crea dos recaudos (idempotencia por reference_code)', async () => {
    const { adm } = await admisionConCobro()
    await crearCobro(adm.id)
    assert.equal(await cuantos(`from recaudos where admision_id = $1`, [adm.id]), 1)
  })
})

describe('Webhook de Factus Pay (sección 6.3)', () => {
  it('llave inválida → 401 y no guarda ni procesa nada', async () => {
    const { adm, referencia, monto } = await admisionConCobro()
    const r = await procesarWebhookFactusPay(urlWebhook('llave-equivocada'), avisoPago(referencia, monto))
    assert.equal(r.status, 401)
    assert.equal(await cuantos(`from webhook_events`), 0)
    assert.equal(await estadoAdmision(adm.id), 'cobro_pendiente')
  })

  it('sin llave → 401', async () => {
    const url = new URL('https://app.test/webhooks/factus-pay')
    assert.equal((await procesarWebhookFactusPay(url, '{}')).status, 401)
  })

  it('pago confirmado → recaudo paid, admisión pagada, factura SS-Recaudo encolada y evento auditado', async () => {
    const { adm, referencia, monto } = await admisionConCobro()
    const r = await procesarWebhookFactusPay(urlWebhook(), avisoPago(referencia, monto))
    assert.equal(r.status, 200)
    assert.deepEqual(r.body, { received: true })
    assert.equal((await db.q1(`select estado from recaudos where reference_code = $1`, [referencia])).estado, 'paid')
    assert.equal(await estadoAdmision(adm.id), 'pagada')
    assert.equal(await cuantos(`from jobs where tipo = 'emitir_ss_recaudo' and clave = $1`, [referencia]), 1)
    assert.equal((await db.q1(`select resultado from webhook_events order by id desc limit 1`)).resultado, 'pagado')
  })

  it('webhook repetido (Factus reintenta) → 200, sin reprocesar ni duplicar la factura', async () => {
    const { referencia, monto } = await admisionConCobro()
    await procesarWebhookFactusPay(urlWebhook(), avisoPago(referencia, monto))
    const r = await procesarWebhookFactusPay(urlWebhook(), avisoPago(referencia, monto))
    assert.equal(r.status, 200)
    assert.equal(await cuantos(`from jobs where clave = $1`, [referencia]), 1)
    assert.equal(await cuantos(`from webhook_events`), 2)
    assert.equal((await db.q1(`select resultado from webhook_events order by id desc limit 1`)).resultado, 'duplicado')
  })

  it('monto distinto al esperado → requiere_revision, sin factura, y responde 200', async () => {
    const { adm, referencia } = await admisionConCobro()
    const r = await procesarWebhookFactusPay(urlWebhook(), avisoPago(referencia, 1000))
    assert.equal(r.status, 200)
    assert.equal(await estadoAdmision(adm.id), 'requiere_revision')
    assert.equal(await cuantos(`from jobs`), 0)
  })

  it('referencia desconocida → se audita y responde 200 (reintentar no cambia nada)', async () => {
    const r = await procesarWebhookFactusPay(urlWebhook(), avisoPago('ADM-OTRO-EQUIPO-1', 4700))
    assert.equal(r.status, 200)
    assert.equal((await db.q1(`select resultado from webhook_events`)).resultado, 'recaudo_desconocido')
  })

  it('JSON inválido → se guarda el evento y responde 200', async () => {
    const r = await procesarWebhookFactusPay(urlWebhook(), 'esto no es json')
    assert.equal(r.status, 200)
    assert.equal((await db.q1(`select resultado from webhook_events`)).resultado, 'json_invalido')
  })

  it('aviso con estado distinto de paid → se ignora sin facturar', async () => {
    const { adm, referencia, monto } = await admisionConCobro()
    await procesarWebhookFactusPay(urlWebhook(), avisoPago(referencia, monto, 'ready'))
    assert.equal(await estadoAdmision(adm.id), 'cobro_pendiente')
    assert.equal(await cuantos(`from jobs`), 0)
  })

  it('el evento auditado no guarda el documento completo del pagador', async () => {
    const { referencia, monto } = await admisionConCobro()
    const cuerpo = JSON.stringify({
      data: { reference_code: referencia, amount: String(monto), status: 'paid', payer: { name: 'Ana', document_number: '1234567890' } },
    })
    await procesarWebhookFactusPay(urlWebhook(), cuerpo)
    const ev = await db.q1(`select cuerpo from webhook_events`)
    assert.equal(ev.cuerpo.data.payer.document_number, '****7890')
  })
})

describe('Estados de la admisión (sección 11.5)', () => {
  it('flujo completo: creada → cobro_pendiente → pagada → copago_facturado con SS-Recaudo validada', async () => {
    const { adm, referencia, monto } = await admisionConCobro()
    pay.simular(referencia, 'paid') // el paciente paga el QR
    await procesarWebhookFactusPay(urlWebhook(), avisoPago(referencia, monto))
    await procesarJobs()
    assert.equal(await estadoAdmision(adm.id), 'copago_facturado')
    const f = await db.q1(`select tipo, reference_code, is_validated from facturas where admision_id = $1`, [adm.id])
    assert.equal(f.tipo, 'SS-Recaudo')
    assert.equal(f.reference_code, `FV-${referencia}`)
    assert.equal(f.is_validated, true)
  })

  it('un webhook falso (Factus Pay no confirma el pago) no genera factura', async () => {
    const { adm, referencia, monto } = await admisionConCobro()
    // Llega el aviso con la llave correcta, pero en Factus Pay el recaudo sigue sin pagar
    await procesarWebhookFactusPay(urlWebhook(), avisoPago(referencia, monto))
    await procesarJobs()
    assert.equal(await cuantos(`from facturas where admision_id = $1 and is_validated`, [adm.id]), 0)
    assert.notEqual(await estadoAdmision(adm.id), 'copago_facturado')
  })

  it('el polling confirma el pago aunque el webhook no llegue (respaldo)', async () => {
    const { adm, referencia } = await admisionConCobro()
    pay.simular(referencia, 'paid')
    const rec = await db.q1(`select reference_code, admision_id, qr_expira from recaudos where reference_code = $1`, [referencia])
    assert.equal(await reconciliarRecaudo(rec), 'pagado')
    assert.equal(await estadoAdmision(adm.id), 'pagada')
  })

  it('pago rechazado → cobro_fallido y no se emite ninguna factura', async () => {
    const { adm, referencia } = await admisionConCobro()
    pay.simular(referencia, 'rejected')
    const rec = await db.q1(`select reference_code, admision_id, qr_expira from recaudos where reference_code = $1`, [referencia])
    await reconciliarRecaudo(rec)
    await procesarJobs()
    assert.equal(await estadoAdmision(adm.id), 'cobro_fallido')
    assert.equal(await cuantos(`from facturas where admision_id = $1`, [adm.id]), 0)
  })

  it('tras un pago rechazado, el nuevo cobro usa una referencia nueva (intento 2)', async () => {
    const { adm, referencia } = await admisionConCobro()
    pay.simular(referencia, 'rejected')
    const rec = await db.q1(`select reference_code, admision_id, qr_expira from recaudos where reference_code = $1`, [referencia])
    await reconciliarRecaudo(rec)
    await crearCobro(adm.id)
    const refs = (await db.q(`select reference_code from recaudos where admision_id = $1 order by intento`, [adm.id])).map((r) => r.reference_code)
    assert.equal(refs.length, 2)
    assert.notEqual(refs[0], refs[1])
  })

  it('no se puede cobrar de nuevo una admisión ya pagada', async () => {
    const { adm, referencia, monto } = await admisionConCobro()
    await confirmarPago(referencia, monto, 'webhook')
    await assert.rejects(crearCobro(adm.id), /pago confirmado|ya está pagado/)
  })

  it('un pago tardío no hace retroceder una admisión que ya avanzó', async () => {
    const { adm, referencia, monto } = await admisionConCobro()
    await db.q(`update admisiones set estado = 'facturada_eps' where id = $1`, [adm.id])
    await confirmarPago(referencia, monto, 'webhook')
    assert.equal(await estadoAdmision(adm.id), 'facturada_eps')
  })
})

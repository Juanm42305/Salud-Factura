// Clientes HTTP contra servidores falsos: token OAuth2, 401, 409, 5xx y token único de Factus Pay.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { FactusAuthManager } from '../lib/factus/factusAuth'
import { FactusClient } from '../lib/factus/factusClient'
import { FactusPayAuth } from '../lib/factus/payAuth'
import { FactusPayClient } from '../lib/factus/payClient'
import { MemoriaTokenStore } from '../lib/factus/tokenStore'
import { crearFactusFalso, crearPayFalso } from './servidoresFalsos'

const factusSrv = crearFactusFalso()
const paySrv = crearPayFalso()
let urlFactus = ''
let urlPay = ''

before(async () => {
  urlFactus = await factusSrv.iniciar()
  urlPay = await paySrv.iniciar()
})
after(() => {
  factusSrv.cerrar()
  paySrv.cerrar()
})

const nuevoFactus = () => {
  const cfg = () => ({ baseUrl: urlFactus, clientId: 'cid', clientSecret: 'csec', username: 'u@test', password: 'pw' })
  const auth = new FactusAuthManager(new MemoriaTokenStore(), cfg)
  return { auth, cliente: new FactusClient(auth, cfg, { esperaBaseMs: 5 }) }
}

const factura = (ref: string) => ({
  reference_code: ref,
  document: '01',
  operation_type: '10',
  payment_details: [{ payment_form: 1, payment_method_code: '10', amount: '1000.00' }],
  customer: { identification_document_code: '13', identification: '1', names: 'X', legal_organization_code: '2' },
  items: [{ code_reference: 'A', name: 'A', quantity: '1.00', price: '1000.00', unit_measure_code: '94', standard_code: '999', taxes: [{ is_excluded: true }] }],
})

describe('Factus Facturación', () => {
  it('pide token una vez y lo reutiliza', async () => {
    const { auth, cliente } = nuevoFactus()
    await cliente.rangosNumeracion()
    await cliente.rangosNumeracion()
    assert.deepEqual(auth.pedidos, { password: 1, refresh_token: 0 })
  })

  it('renueva con refresh_token cuando faltan menos de 5 minutos', async () => {
    factusSrv.st.expiresIn = 200 // 3,3 minutos: nace "por vencer"
    const { auth, cliente } = nuevoFactus()
    await cliente.rangosNumeracion() // password
    await cliente.rangosNumeracion() // refresh
    factusSrv.st.expiresIn = 3600
    assert.equal(auth.pedidos.refresh_token >= 1, true)
  })

  it('ante un 401 renueva una sola vez y reintenta', async () => {
    const { auth, cliente } = nuevoFactus()
    await cliente.rangosNumeracion()
    factusSrv.st.tokens.clear() // el servidor invalida todos los tokens
    const rangos = await cliente.rangosNumeracion()
    assert.equal(rangos.length, 2)
    assert.equal(auth.pedidos.password + auth.pedidos.refresh_token, 2)
  })

  it('reference_code repetido devuelve la factura existente', async () => {
    const { cliente } = nuevoFactus()
    const a = await cliente.validarFactura(factura('T-IDEM'))
    const b = await cliente.validarFactura(factura('T-IDEM'))
    assert.ok(a.ok && b.ok)
    if (a.ok && b.ok) assert.equal(a.doc.numero, b.doc.numero)
  })

  it('409: consulta, elimina la no validada y reenvía una sola vez', async () => {
    const { cliente } = nuevoFactus()
    factusSrv.st.conflictoUnaVez.add('T-409')
    const r = await cliente.validarFactura(factura('T-409'))
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.via, 'reintento_409')
    assert.ok(factusSrv.st.eliminados.includes('T-409'))
  })

  it('422 no se reintenta y devuelve el mensaje', async () => {
    const { cliente } = nuevoFactus()
    const r = await cliente.validarFactura({ ...factura('T-422'), items: [] })
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.status, 422)
      assert.match(r.mensaje, /Datos inválidos/)
    }
  })

  it('5xx: reintenta con espera creciente', async () => {
    const { cliente } = nuevoFactus()
    factusSrv.st.fallar5xx = 3
    const r = await cliente.validarFactura(factura('T-503'))
    assert.equal(r.ok, true)
  })

  it('descarga PDF y XML en base64', async () => {
    const { cliente } = nuevoFactus()
    const r = await cliente.validarFactura(factura('T-PDF'))
    assert.ok(r.ok)
    if (!r.ok) return
    const pdf = await cliente.descargar('factura', r.doc.numero!, 'pdf')
    assert.ok(Buffer.from(pdf.base64, 'base64').toString().startsWith('%PDF'))
    const xml = await cliente.descargar('factura', r.doc.numero!, 'xml')
    assert.match(Buffer.from(xml.base64, 'base64').toString(), /<Invoice>/)
  })
})

describe('Factus Pay', () => {
  const cfg = () => ({ baseUrl: urlPay, email: 'pay@test', password: 'paypw' })

  it('crear recaudo es idempotente (201 y luego 200 "ya existente")', async () => {
    const auth = new FactusPayAuth(new MemoriaTokenStore(), cfg)
    const pay = new FactusPayClient(auth, cfg)
    const a = await pay.crearRecaudo('ADM-T-1-COP', 4700, 900)
    const b = await pay.crearRecaudo('ADM-T-1-COP', 4700, 900)
    assert.equal(a.existente, false)
    assert.equal(b.existente, true)
    assert.equal(a.recaudo.status, 'ready')
    assert.equal(await pay.verRecaudo('NO-EXISTE'), null)
  })

  it('token revocado por otro /auth: varias peticiones a la vez reautentican UNA sola vez', async () => {
    const store = new MemoriaTokenStore()
    const auth = new FactusPayAuth(store, cfg)
    const pay = new FactusPayClient(auth, cfg)
    await pay.ping()
    paySrv.st.tokenActivo = 'otro-portatil' // alguien llamó /auth con el mismo usuario
    const antes = paySrv.st.auths
    const r = await Promise.all([pay.ping(), pay.ping(), pay.ping(), pay.verRecaudo('ADM-T-1-COP')])
    assert.ok(r.slice(0, 3).every((x: any) => x.ok))
    assert.equal(paySrv.st.auths - antes, 1)
  })

  it('credenciales malas (422) no entran en bucle', async () => {
    const malo = () => ({ baseUrl: urlPay, email: 'pay@test', password: 'mal' })
    const auth = new FactusPayAuth(new MemoriaTokenStore(), malo)
    const pay = new FactusPayClient(auth, malo)
    await assert.rejects(pay.ping(), /422|Credenciales/)
    assert.equal(auth.autenticaciones, 1)
  })
})

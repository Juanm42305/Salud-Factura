// Servidores falsos de Factus Facturación y Factus Pay (imitan la documentación v2) para probar sin credenciales.
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

function leer(req: IncomingMessage): Promise<string> {
  return new Promise((ok) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => ok(b))
  })
}

function json(res: ServerResponse, status: number, cuerpo: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(cuerpo))
}

function escuchar(server: Server): Promise<string> {
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${(server.address() as any).port}`)))
}

// ── Factus Facturación ─────────────────────────────────────────
export function crearFactusFalso() {
  const st = {
    tokens: new Map<string, number>(),
    refresh: new Set<string>(),
    grants: [] as string[],
    docs: new Map<string, any>(), // reference_code → documento
    n: 0,
    conflictoUnaVez: new Set<string>(),
    eliminados: [] as string[],
    expiresIn: 3600,
    fallar5xx: 0,
    rutas: [] as string[],
    payloads: new Map<string, any>(),
  }
  const emitirToken = () => {
    st.n++
    const access = `fa-${st.n}`
    const refresh = `fr-${st.n}`
    st.tokens.set(access, Date.now() + st.expiresIn * 1000)
    st.refresh.add(refresh)
    return { token_type: 'Bearer', expires_in: st.expiresIn, access_token: access, refresh_token: refresh }
  }
  const crearDoc = (tipo: 'bill' | 'nota', body: any, validado = true) => {
    st.n++
    const total = (body.items ?? []).reduce((s: number, i: any) => s + Number(i.price) * Number(i.quantity), 0)
    const numero = tipo === 'bill' ? `SETP${990000000 + st.n}` : `NC${st.n}`
    const doc = {
      id: st.n,
      number: numero,
      reference_code: body.reference_code,
      is_validated: validado,
      status: validado ? 1 : 0,
      [tipo === 'bill' ? 'cufe' : 'cude']: createHash('sha384').update(body.reference_code).digest('hex'),
      links: { public_url: `https://sandbox.factus.test/${numero}`, qr: `https://qr.test/${numero}` },
      totals: { total: total.toFixed(2) },
      tipo,
    }
    st.docs.set(body.reference_code, doc)
    st.payloads.set(body.reference_code, body)
    return doc
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost')
    const cuerpo = await leer(req)
    st.rutas.push(`${req.method} ${url.pathname}${url.search}`)

    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      const p = new URLSearchParams(cuerpo)
      if (p.get('client_id') !== 'cid' || p.get('client_secret') !== 'csec') return json(res, 401, { error: 'invalid_client' })
      const grant = p.get('grant_type')!
      st.grants.push(grant)
      if (grant === 'password') {
        if (p.get('username') !== 'u@test' || p.get('password') !== 'pw') return json(res, 400, { error: 'invalid_grant' })
        return json(res, 200, emitirToken())
      }
      if (grant === 'refresh_token') {
        const r = p.get('refresh_token')!
        if (!st.refresh.has(r)) return json(res, 401, { error: 'invalid_refresh' })
        st.refresh.delete(r)
        return json(res, 200, emitirToken())
      }
      return json(res, 400, { error: 'unsupported_grant_type' })
    }

    const token = (req.headers.authorization ?? '').replace('Bearer ', '')
    const exp = st.tokens.get(token)
    if (!exp || exp < Date.now()) return json(res, 401, { message: 'Unauthenticated.' })

    if (req.method === 'POST' && (url.pathname === '/v2/bills/validate' || url.pathname === '/v2/credit-notes/validate')) {
      if (st.fallar5xx > 0) {
        st.fallar5xx--
        return json(res, 503, { message: 'Service Unavailable' })
      }
      const body = JSON.parse(cuerpo)
      const tipo = url.pathname.includes('bills') ? 'bill' : 'nota'
      if (!body.reference_code || !body.items?.length) return json(res, 422, { message: 'Datos inválidos', errors: { reference_code: ['requerido'] } })
      if (tipo === 'bill' && body.operation_type === 'SS-CUFE' && !body.health) return json(res, 422, { message: 'health requerido' })
      if (tipo === 'nota' && ![...st.docs.values()].some((d) => d.number === body.bill_number))
        return json(res, 422, { message: 'Factura no existe', errors: { bill_number: ['inválido'] } })
      if (st.conflictoUnaVez.has(body.reference_code)) {
        st.conflictoUnaVez.delete(body.reference_code)
        crearDoc(tipo, body, false)
        return json(res, 409, { message: 'Se encontró una factura pendiente por enviar a la DIAN' })
      }
      const previo = st.docs.get(body.reference_code)
      if (previo?.is_validated) return json(res, 200, { status: 'OK', message: 'Documento existente', data: previo })
      if (previo && !previo.is_validated) return json(res, 409, { message: 'Se encontró una factura pendiente por enviar a la DIAN' })
      const doc = crearDoc(tipo, body)
      return json(res, 201, { status: 'Created', message: `Documento con el código de referencia ${body.reference_code} registrado y validado con éxito`, data: doc })
    }

    let m: RegExpExecArray | null
    if (req.method === 'GET' && (m = /^\/v2\/(bills|credit-notes)$/.exec(url.pathname))) {
      const ref = url.searchParams.get('filter[reference_code]')
      const lista = [...st.docs.values()].filter((d) => !ref || d.reference_code === ref)
      return json(res, 200, { status: 'OK', data: { data: lista.map((d) => ({ number: d.number, reference_code: d.reference_code, status: d.status })), pagination: { total: lista.length } } })
    }
    if (req.method === 'DELETE' && (m = /^\/v2\/(bills|credit-notes)\/destroy\/reference\/(.+)$/.exec(url.pathname))) {
      const ref = decodeURIComponent(m[2])
      const d = st.docs.get(ref)
      if (!d) return json(res, 404, { message: 'No encontrado' })
      if (d.is_validated) return json(res, 409, { message: 'Ya validada' })
      st.docs.delete(ref)
      st.eliminados.push(ref)
      return json(res, 200, { status: 'OK', message: 'Documento eliminado con éxito' })
    }
    if (req.method === 'GET' && (m = /^\/v2\/(bills|credit-notes)\/([^/]+)\/download-(pdf|xml)\/?$/.exec(url.pathname))) {
      const numero = decodeURIComponent(m[2])
      const d = [...st.docs.values()].find((x) => x.number === numero)
      if (!d) return json(res, 404, { message: 'No encontrado' })
      if (m[3] === 'pdf') return json(res, 200, { data: { file_name: `${numero}.pdf`, pdf_base_64_encoded: Buffer.from(`%PDF-1.4 ${numero}`).toString('base64') } })
      return json(res, 200, { data: { file_name: `${numero}.xml`, xml_base_64_encoded: Buffer.from(`<Invoice>${numero}</Invoice>`).toString('base64') } })
    }
    if (req.method === 'GET' && (m = /^\/v2\/(bills|credit-notes)\/([^/]+)$/.exec(url.pathname))) {
      const numero = decodeURIComponent(m[2])
      const d = [...st.docs.values()].find((x) => x.number === numero)
      return d ? json(res, 200, { status: 'OK', data: d }) : json(res, 404, { message: 'No encontrado' })
    }
    if (req.method === 'GET' && url.pathname === '/v2/numbering-ranges') {
      return json(res, 200, {
        status: 'OK',
        data: {
          data: [
            { id: 8, document: 'Factura de Venta', prefix: 'SETP', from: 990000000, to: 995000000, current: 990000100, is_expired: 0, is_active: 1 },
            { id: 9, document: 'Nota Crédito', prefix: 'NC', from: 1, to: 9999, current: 5, is_expired: 0, is_active: 1 },
          ],
        },
      })
    }
    json(res, 404, { message: `Ruta falsa no implementada: ${req.method} ${url.pathname}` })
  })
  return { st, iniciar: () => escuchar(server), cerrar: () => server.close() }
}

// ── Factus Pay ─────────────────────────────────────────────────
export function crearPayFalso() {
  const st = {
    tokenActivo: null as string | null,
    auths: 0,
    recaudos: new Map<string, any>(),
    rutas: [] as string[],
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost')
    const cuerpo = await leer(req)
    st.rutas.push(`${req.method} ${url.pathname}${url.search}`)
    if (req.method === 'POST' && url.pathname === '/auth') {
      const b = JSON.parse(cuerpo)
      if (b.email !== 'pay@test' || b.password !== 'paypw') return json(res, 422, { message: 'Credenciales inválidas' })
      st.auths++
      st.tokenActivo = `${st.auths}|tokenpay` // revoca el anterior
      return json(res, 200, { token: st.tokenActivo })
    }
    if ((req.headers.authorization ?? '') !== `Bearer ${st.tokenActivo}`) return json(res, 401, { message: 'Unauthenticated.' })

    if (req.method === 'POST' && url.pathname === '/v1/collections') {
      const b = JSON.parse(cuerpo)
      const monto = Number(b.amount)
      if (!(monto >= 1000 && monto <= 12_100_000)) return json(res, 422, { message: 'El monto es inválido', errors: { amount: ['fuera de rango'] } })
      const previo = st.recaudos.get(b.reference_code)
      if (previo) return json(res, 200, { data: previo, status: 'success', message: 'Recaudo ya existente' })
      const r = {
        reference_code: b.reference_code,
        amount: monto,
        status: 'ready',
        breb_key: `@FC${st.recaudos.size + 100}XYZ`,
        created_at: '04-11-2026 08:47:00 AM',
        qr_expires_at: '04-11-2099 09:02:00 AM',
        collected_at: null,
        qr: 'data:image/png;base64,iVBORw0KGgo=',
      }
      st.recaudos.set(b.reference_code, r)
      return json(res, 201, { data: r, status: 'success', message: 'Recaudo creado correctamente' })
    }
    let m: RegExpExecArray | null
    if (req.method === 'GET' && (m = /^\/v1\/collections\/(.+)$/.exec(url.pathname))) {
      const r = st.recaudos.get(decodeURIComponent(m[1]))
      return r ? json(res, 200, { data: r, status: 'success' }) : json(res, 404, { message: 'No encontrado' })
    }
    if (req.method === 'GET' && url.pathname === '/v1/collections') {
      return json(res, 200, { data: { data: [...st.recaudos.values()] }, status: 'success' })
    }
    json(res, 404, { message: 'ruta falsa no implementada' })
  })
  const pagar = (ref: string, status: 'paid' | 'rejected' | 'failed') => {
    const r = st.recaudos.get(ref)
    r.status = status
    if (status === 'paid') {
      r.collected_at = '04-11-2026 08:50:00 AM'
      r.payer = { name: 'Ana María Pérez', document_type: 'CC', document_number: '1234567890' }
    }
    return { data: { ...r } }
  }
  return { st, pagar, iniciar: () => escuchar(server), cerrar: () => server.close() }
}

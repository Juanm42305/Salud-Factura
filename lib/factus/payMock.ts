// Factus Pay simulado para los portátiles del equipo (FACTUS_PAY_MOCK=true).
// No llama a /auth, así que no revoca el token del servidor desplegado.
// Guarda los recaudos en memoria del proceso: sirve con `npm run dev`, no en Vercel.
import type { PayApi, RecaudoPay } from './payClient'

const g = globalThis as unknown as { __sfPayMock?: Map<string, RecaudoPay> }
const recaudos = () => (g.__sfPayMock ??= new Map())

function qrFalso(texto: string): string {
  // Cuadrícula pseudoaleatoria a partir del texto: parece un QR pero dice MOCK
  let semilla = [...texto].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const celdas: string[] = []
  const origenes = [[0, 0], [14, 0], [0, 14]]
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      semilla = (semilla * 1103515245 + 12345) >>> 0
      const o = origenes.find(([ox, oy]) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7)
      let encendida: boolean
      if (o) {
        const [lx, ly] = [x - o[0], y - o[1]]
        encendida = lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4)
      } else {
        encendida = semilla % 3 === 0
      }
      if (encendida) celdas.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`)
    }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 25 27"><rect x="-2" y="-2" width="25" height="27" fill="#fff"/><g fill="#111">${celdas.join('')}</g><text x="10.5" y="24" font-size="2.2" text-anchor="middle" font-family="monospace" fill="#c00">MOCK</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function fechaFactus(d: Date): string {
  // Formato que usa Factus Pay: DD-MM-YYYY hh:mm:ss AM/PM (hora Colombia)
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${v('day')}-${v('month')}-${v('year')} ${v('hour')}:${v('minute')}:${v('second')} ${v('dayPeriod').toUpperCase()}`
}

export class MockPayApi implements PayApi {
  readonly modo = 'mock' as const

  async crearRecaudo(referencia: string, monto: number, expiracionSeg: number) {
    const existente = recaudos().get(referencia)
    if (existente) {
      if (existente.status === 'ready') {
        existente.qr_expires_at = fechaFactus(new Date(Date.now() + expiracionSeg * 1000))
      }
      return { recaudo: { ...existente }, existente: true }
    }
    const ahora = new Date()
    const r: RecaudoPay = {
      reference_code: referencia,
      amount: monto,
      status: 'ready',
      breb_key: `@FCMOCK${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      created_at: fechaFactus(ahora),
      qr_expires_at: fechaFactus(new Date(ahora.getTime() + expiracionSeg * 1000)),
      collected_at: null,
      qr: qrFalso(referencia),
    }
    recaudos().set(referencia, r)
    return { recaudo: { ...r }, existente: false }
  }

  async verRecaudo(referencia: string) {
    const r = recaudos().get(referencia)
    return r ? { ...r } : null
  }

  async listarRecaudos(status?: 'ready' | 'paid' | 'failed') {
    return [...recaudos().values()].filter((r) => !status || r.status === status).map((r) => ({ ...r }))
  }

  async ping() {
    return { ok: true, detalle: 'Modo simulado (FACTUS_PAY_MOCK=true): no se llama a Factus Pay' }
  }

  /** Equivale a escanear el QR en el simulador de Factus Pay. */
  simular(referencia: string, resultado: 'paid' | 'rejected' | 'failed'): RecaudoPay | null {
    const r = recaudos().get(referencia)
    if (!r) return null
    r.status = resultado
    if (resultado === 'paid') {
      r.collected_at = fechaFactus(new Date())
      r.payer = { name: 'Pagador Simulado', document_type: 'CC', document_number: '1000000001' }
    }
    return { ...r }
  }
}

// Cliente HTTP de Factus Pay: crear y consultar recaudos (QR Bre-B).
import { ErrorApi, mensajeDe } from '../errores'
import { pedir, type RespuestaHttp } from '../http'
import { log } from '../logger'
import type { ConfigPay, FactusPayAuth } from './payAuth'

export type EstadoRecaudoPay = 'ready' | 'started' | 'paid' | 'rejected' | 'failed' | string

export interface RecaudoPay {
  reference_code: string
  amount: number
  status: EstadoRecaudoPay
  breb_key?: string | null
  created_at?: string | null
  qr_expires_at?: string | null
  collected_at?: string | null
  qr?: string | null
  payer?: { name?: string; document_type?: string; document_number?: string } | null
}

export interface PayApi {
  readonly modo: 'sandbox' | 'mock'
  crearRecaudo(referencia: string, monto: number, expiracionSeg: number): Promise<{ recaudo: RecaudoPay; existente: boolean }>
  /** null si Factus Pay responde 404. */
  verRecaudo(referencia: string): Promise<RecaudoPay | null>
  /** GET /v1/collections (15 por página): recorre las páginas hasta `maxPaginas`. */
  listarRecaudos(status?: 'ready' | 'paid' | 'failed', maxPaginas?: number): Promise<RecaudoPay[]>
  /** Prueba de vida para /api/salud. */
  ping(): Promise<{ ok: boolean; detalle: string }>
}

function normalizar(d: any): RecaudoPay {
  return {
    reference_code: String(d?.reference_code ?? ''),
    amount: Number(d?.amount ?? 0),
    status: String(d?.status ?? ''),
    breb_key: d?.breb_key ?? null,
    created_at: d?.created_at ?? null,
    qr_expires_at: d?.qr_expires_at ?? null,
    collected_at: d?.collected_at ?? null,
    qr: d?.qr ?? null,
    payer: d?.payer ?? null,
  }
}

export class FactusPayClient implements PayApi {
  readonly modo = 'sandbox' as const

  constructor(private auth: FactusPayAuth, private config: () => ConfigPay) {}

  private async llamar(method: string, ruta: string, body?: unknown): Promise<RespuestaHttp> {
    const cfg = this.config()
    const enviar = (token: string) =>
      pedir(`${cfg.baseUrl}${ruta}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        timeoutMs: 20_000,
      })

    let token = await this.auth.token()
    let r = await enviar(token)
    if (r.status === 401) {
      // Token revocado (otro /auth con el mismo usuario): reautenticar una sola vez
      log.warn('factus_pay.401', { ruta })
      token = await this.auth.reautenticar(token)
      r = await enviar(token)
    }
    if (r.status === 429) {
      throw new ErrorApi('factus_pay', 429, r.cuerpo, 'Factus Pay: límite de peticiones por minuto, espera 60 s')
    }
    return r
  }

  async crearRecaudo(referencia: string, monto: number, expiracionSeg: number) {
    const r = await this.llamar('POST', '/v1/collections', {
      reference_code: referencia,
      amount: monto.toFixed(2).replace(/\.00$/, ''),
      expiration: expiracionSeg,
    })
    // 201 = creado; 200 = "Recaudo ya existente" (mismo reference_code): ambos son éxito
    if (r.status === 201 || r.status === 200) {
      return { recaudo: normalizar(r.cuerpo?.data), existente: r.status === 200 }
    }
    throw new ErrorApi(
      'factus_pay',
      r.status,
      r.cuerpo,
      `Factus Pay crear recaudo: ${mensajeDe(r.cuerpo, `HTTP ${r.status}`)}`,
      r.status === 0 || r.status >= 500,
    )
  }

  async verRecaudo(referencia: string) {
    const r = await this.llamar('GET', `/v1/collections/${encodeURIComponent(referencia)}`)
    if (r.status === 404) return null
    if (r.status === 200) return normalizar(r.cuerpo?.data)
    throw new ErrorApi(
      'factus_pay',
      r.status,
      r.cuerpo,
      `Factus Pay ver recaudo: ${mensajeDe(r.cuerpo, `HTTP ${r.status}`)}`,
      r.status === 0 || r.status >= 500,
    )
  }

  async listarRecaudos(status?: 'ready' | 'paid' | 'failed', maxPaginas = 10) {
    const todos: RecaudoPay[] = []
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const q = new URLSearchParams({ page: String(pagina) })
      if (status) q.set('status', status)
      const r = await this.llamar('GET', `/v1/collections?${q}`)
      if (r.status !== 200) {
        throw new ErrorApi('factus_pay', r.status, r.cuerpo, `Factus Pay listar recaudos: ${mensajeDe(r.cuerpo, `HTTP ${r.status}`)}`)
      }
      const lista = Array.isArray(r.cuerpo?.data) ? r.cuerpo.data : Array.isArray(r.cuerpo?.data?.data) ? r.cuerpo.data.data : []
      todos.push(...lista.map(normalizar))
      const ultima = Number(r.cuerpo?.meta?.last_page ?? r.cuerpo?.data?.meta?.last_page ?? r.cuerpo?.data?.last_page ?? pagina)
      if (lista.length === 0 || pagina >= ultima) break
    }
    return todos
  }

  async ping() {
    const r = await this.llamar('GET', '/v1/collections?status=ready')
    return { ok: r.status === 200, detalle: r.status === 200 ? 'Token válido' : `HTTP ${r.status}: ${mensajeDe(r.cuerpo)}` }
  }
}

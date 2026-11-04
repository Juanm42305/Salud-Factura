// Cliente HTTP de Factus Facturación (API v2): facturas, notas crédito, descargas y rangos.
// Manejo de errores (sección 11.4):
//  401 → renovar token una vez y reintentar
//  409 → algoritmo 11.3 (consultar por referencia; si no está validada, eliminar y reenviar una vez)
//  422/400 → no reintentar; se devuelve el mensaje para mostrarlo en el panel
//  5xx/timeout → reintentar con espera 2 s, 4 s, 8 s (máx. 3)
import { ErrorApi, mensajeDe } from '../errores'
import { pedir, type RespuestaHttp } from '../http'
import { esperar } from '../lock'
import { log } from '../logger'
import type { ConfigFactus, FactusAuthManager } from './factusAuth'

export type TipoDocumento = 'factura' | 'nota'

export interface DocumentoFactus {
  id: string | null
  numero: string | null
  cufe: string | null // CUFE en facturas, CUDE en notas crédito
  is_validated: boolean
  public_url: string | null
  qr: string | null
  total: number | null
  errores: unknown
  raw: unknown
}

export type ResultadoEmision =
  | { ok: true; doc: DocumentoFactus; via: 'creada' | 'existente' | 'reintento_409' }
  | { ok: false; status: number; mensaje: string; cuerpo: unknown; requiereRevision: boolean }

export interface FactusApi {
  readonly modo: 'sandbox' | 'mock'
  validarFactura(payload: Record<string, any>): Promise<ResultadoEmision>
  validarNotaCredito(payload: Record<string, any>): Promise<ResultadoEmision>
  descargar(tipo: TipoDocumento, numero: string, formato: 'pdf' | 'xml'): Promise<{ nombre: string; base64: string }>
  rangosNumeracion(): Promise<Array<Record<string, any>>>
}

const RUTAS: Record<TipoDocumento, { base: string; pdf: (n: string) => string; xml: (n: string) => string }> = {
  factura: {
    base: '/v2/bills',
    pdf: (n) => `/v2/bills/${encodeURIComponent(n)}/download-pdf`,
    xml: (n) => `/v2/bills/${encodeURIComponent(n)}/download-xml/`,
  },
  nota: {
    base: '/v2/credit-notes',
    pdf: (n) => `/v2/credit-notes/${encodeURIComponent(n)}/download-pdf`,
    xml: (n) => `/v2/credit-notes/${encodeURIComponent(n)}/download-xml`,
  },
}

export function parsearDocumento(cuerpo: any): DocumentoFactus {
  const d = cuerpo?.data?.bill ?? cuerpo?.data?.credit_note ?? cuerpo?.data ?? cuerpo ?? {}
  const validado = d.is_validated ?? (d.status === 1 || d.status === '1' ? true : undefined)
  return {
    id: d.id != null ? String(d.id) : null,
    numero: d.number ?? null,
    cufe: d.cufe ?? d.cude ?? null,
    is_validated: validado === true || validado === 1 || validado === '1',
    public_url: d.links?.public_url ?? d.public_url ?? null,
    qr: d.links?.qr ?? d.qr ?? null,
    total: d.totals?.total != null ? Number(d.totals.total) : d.total != null ? Number(d.total) : null,
    errores: d.errors ?? null,
    raw: cuerpo,
  }
}

export interface OpcionesCliente {
  esperaBaseMs?: number // 2000 en producción; las pruebas lo bajan
}

export class FactusClient implements FactusApi {
  readonly modo = 'sandbox' as const
  private esperaBaseMs: number

  constructor(private auth: FactusAuthManager, private config: () => ConfigFactus, opciones: OpcionesCliente = {}) {
    this.esperaBaseMs = opciones.esperaBaseMs ?? 2000
  }

  private async llamar(method: string, ruta: string, body?: unknown): Promise<RespuestaHttp> {
    const cfg = this.config()
    let reautenticado = false
    let intento5xx = 0
    for (;;) {
      const token = await this.auth.token()
      const r = await pedir(`${cfg.baseUrl}${ruta}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        timeoutMs: 45_000,
      })
      if (r.status === 401 && !reautenticado) {
        log.warn('factus.401', { ruta })
        await this.auth.renovar(token)
        reautenticado = true
        continue
      }
      if ((r.status === 0 || r.status >= 500) && intento5xx < 3) {
        const espera = this.esperaBaseMs * 2 ** intento5xx
        log.warn('factus.reintento', { ruta, status: r.status, espera_ms: espera })
        await esperar(espera)
        intento5xx++
        continue
      }
      return r
    }
  }

  validarFactura(payload: Record<string, any>) {
    return this.emitir('factura', payload)
  }

  validarNotaCredito(payload: Record<string, any>) {
    return this.emitir('nota', payload)
  }

  private async emitir(tipo: TipoDocumento, payload: Record<string, any>): Promise<ResultadoEmision> {
    const { base } = RUTAS[tipo]
    const r = await this.llamar('POST', `${base}/validate`, payload)
    if (r.status === 200 || r.status === 201) {
      // Si la referencia ya existía, Factus devuelve la existente (idempotencia)
      return { ok: true, doc: parsearDocumento(r.cuerpo), via: 'creada' }
    }
    if (r.status === 409) return this.resolver409(tipo, payload)
    return {
      ok: false,
      status: r.status,
      mensaje: mensajeDe(r.cuerpo, `HTTP ${r.status}`),
      cuerpo: r.cuerpo,
      requiereRevision: false,
    }
  }

  /** Algoritmo 11.3: nunca más de un ciclo automático. */
  private async resolver409(tipo: TipoDocumento, payload: Record<string, any>): Promise<ResultadoEmision> {
    const { base } = RUTAS[tipo]
    const referencia = String(payload.reference_code)
    log.warn('factus.409', { tipo, referencia })

    const existente = await this.buscarPorReferencia(tipo, referencia)
    if (existente?.is_validated) {
      return { ok: true, doc: existente, via: 'existente' }
    }

    const borrado = await this.llamar('DELETE', `${base}/destroy/reference/${encodeURIComponent(referencia)}`)
    log.info('factus.409.eliminar', { referencia, status: borrado.status })
    await esperar(1000)

    const r2 = await this.llamar('POST', `${base}/validate`, payload)
    if (r2.status === 200 || r2.status === 201) {
      return { ok: true, doc: parsearDocumento(r2.cuerpo), via: 'reintento_409' }
    }
    return {
      ok: false,
      status: r2.status,
      mensaje:
        r2.status === 409
          ? 'Factus sigue reportando un documento pendiente con esta referencia (409). Requiere revisión manual.'
          : mensajeDe(r2.cuerpo, `HTTP ${r2.status}`),
      cuerpo: r2.cuerpo,
      requiereRevision: r2.status === 409,
    }
  }

  /** Busca el documento por reference_code y trae su detalle completo si lo encuentra. */
  async buscarPorReferencia(tipo: TipoDocumento, referencia: string): Promise<DocumentoFactus | null> {
    const { base } = RUTAS[tipo]
    const r = await this.llamar('GET', `${base}?filter[reference_code]=${encodeURIComponent(referencia)}`)
    if (r.status !== 200) return null
    const lista = r.cuerpo?.data?.data ?? r.cuerpo?.data ?? []
    const item = Array.isArray(lista) ? lista.find((x: any) => x?.reference_code === referencia) ?? lista[0] : null
    if (!item) return null
    if (item.number) {
      const detalle = await this.llamar('GET', `${base}/${encodeURIComponent(item.number)}`)
      if (detalle.status === 200) {
        const doc = parsearDocumento(detalle.cuerpo)
        if (item.status === 1 || item.status === '1') doc.is_validated = true
        return doc
      }
    }
    return parsearDocumento({ data: item })
  }

  async descargar(tipo: TipoDocumento, numero: string, formato: 'pdf' | 'xml') {
    const ruta = formato === 'pdf' ? RUTAS[tipo].pdf(numero) : RUTAS[tipo].xml(numero)
    const r = await this.llamar('GET', ruta)
    const d = r.cuerpo?.data ?? r.cuerpo ?? {}
    const base64 = formato === 'pdf' ? d.pdf_base_64_encoded : d.xml_base_64_encoded
    if (r.status !== 200 || typeof base64 !== 'string') {
      throw new ErrorApi('factus', r.status, r.cuerpo, `Factus descargar ${formato}: ${mensajeDe(r.cuerpo, `HTTP ${r.status}`)}`)
    }
    return { nombre: d.file_name ?? `${numero}.${formato}`, base64 }
  }

  async rangosNumeracion() {
    const r = await this.llamar('GET', '/v2/numbering-ranges?filter[is_active]=1')
    if (r.status !== 200) {
      throw new ErrorApi('factus', r.status, r.cuerpo, `Factus rangos: ${mensajeDe(r.cuerpo, `HTTP ${r.status}`)}`)
    }
    const lista = r.cuerpo?.data?.data ?? r.cuerpo?.data ?? []
    return Array.isArray(lista) ? lista : []
  }
}

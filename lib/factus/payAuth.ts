// Factus Pay: POST /auth con email y password → { token }. El token no vence por tiempo,
// pero cada nuevo /auth revoca el anterior del mismo usuario. Reglas (sección 4.2):
//  1. Se autentica una sola vez y se reutiliza (guardado en BD, compartido entre instancias).
//  2. Ante un 401 se autentica de nuevo UNA vez, y solo si nadie más lo hizo ya.
//  3. 422 (credenciales mal formadas) y 429 (límite por minuto) no se reintentan en bucle.
import { ErrorApi, mensajeDe } from '../errores'
import { pedir } from '../http'
import { log } from '../logger'
import type { TokenStore } from './tokenStore'

const API = 'factus_pay'

export interface ConfigPay {
  baseUrl: string
  email: string
  password: string
  accessKey?: string
}

export class FactusPayAuth {
  private cache: string | null = null
  private bloqueadoHasta = 0
  autenticaciones = 0 // contador para pruebas y para /api/salud

  constructor(private store: TokenStore, private config: () => ConfigPay) {}

  /** Token vigente: memoria → BD → /auth (solo si no hay ninguno). */
  async token(): Promise<string> {
    if (this.cache) return this.cache
    const guardado = await this.store.leer(API)
    if (guardado?.access_token) {
      this.cache = guardado.access_token
      return this.cache
    }
    return this.reautenticar(null)
  }

  /**
   * Pide un token nuevo solo si el que falló sigue siendo el guardado.
   * Si otra petición/instancia ya lo renovó, usa ese y no llama a /auth (no se revocan en cadena).
   */
  async reautenticar(tokenFallido: string | null): Promise<string> {
    return this.store.conBloqueo(API, async () => {
      const guardado = await this.store.leer(API)
      if (guardado?.access_token && guardado.access_token !== tokenFallido) {
        this.cache = guardado.access_token
        return this.cache
      }
      const nuevo = await this.autenticar()
      await this.store.guardar(API, { access_token: nuevo })
      this.cache = nuevo
      return nuevo
    })
  }

  private async autenticar(): Promise<string> {
    if (Date.now() < this.bloqueadoHasta) {
      throw new ErrorApi('factus_pay', 429, null, 'Factus Pay: límite de intentos de /auth; espera 60 s antes de reintentar')
    }
    const cfg = this.config()
    if (!cfg.email || !cfg.password) {
      throw new ErrorApi('factus_pay', 0, null, 'Faltan FACTUS_PAY_EMAIL / FACTUS_PAY_PASSWORD')
    }
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
    if (cfg.accessKey) headers['X-Factus-Access-Key'] = cfg.accessKey

    this.autenticaciones++
    log.info('factus_pay.auth', { intento: this.autenticaciones })
    const r = await pedir(`${cfg.baseUrl}/auth`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: cfg.email, password: cfg.password }),
      timeoutMs: 15_000,
    })
    if (r.status === 200 || r.status === 201) {
      const token = r.cuerpo?.token ?? r.cuerpo?.data?.token
      if (typeof token === 'string' && token) return token
      throw new ErrorApi('factus_pay', r.status, r.cuerpo, 'Factus Pay /auth no devolvió token')
    }
    if (r.status === 429) this.bloqueadoHasta = Date.now() + 60_000
    throw new ErrorApi('factus_pay', r.status, r.cuerpo, `Factus Pay /auth: ${mensajeDe(r.cuerpo, `HTTP ${r.status}`)}`)
  }

  /** Olvida el token en memoria (para pruebas). */
  limpiarCache() {
    this.cache = null
  }
}

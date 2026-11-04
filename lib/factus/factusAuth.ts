// Factus Facturación: OAuth2 password grant. El access token dura 3600 s.
// Reglas del FactusAuthManager (sección 4.1):
//  1. Guarda access_token, refresh_token y expires_at = ahora + expires_in.
//  2. Si faltan menos de 5 minutos, renueva con el refresh token.
//  3. Si la renovación falla, vuelve a pedir token con password grant.
//  4. Ante un 401, renueva una sola vez y reintenta (lo hace el cliente).
//  5. Un candado evita que dos peticiones renueven a la vez.
import { ErrorApi, mensajeDe } from '../errores'
import { pedir } from '../http'
import { log } from '../logger'
import type { TokenGuardado, TokenStore } from './tokenStore'

const API = 'factus'
const MARGEN_MS = 5 * 60 * 1000

export interface ConfigFactus {
  baseUrl: string
  clientId: string
  clientSecret: string
  username: string
  password: string
}

export class FactusAuthManager {
  private cache: TokenGuardado | null = null
  pedidos = { password: 0, refresh_token: 0 } // contadores para pruebas y /api/salud

  constructor(private store: TokenStore, private config: () => ConfigFactus) {}

  private vigente(t: TokenGuardado | null | undefined): t is TokenGuardado {
    return !!t?.access_token && !!t.expires_at && t.expires_at - Date.now() > MARGEN_MS
  }

  async token(): Promise<string> {
    if (this.vigente(this.cache)) return this.cache.access_token
    const guardado = await this.store.leer(API)
    if (this.vigente(guardado)) {
      this.cache = guardado
      return guardado.access_token
    }
    return this.renovar()
  }

  /**
   * Renueva bajo candado. Con `tokenFallido` (tras un 401) fuerza la renovación,
   * salvo que otra petición ya haya guardado un token distinto.
   */
  async renovar(tokenFallido?: string): Promise<string> {
    return this.store.conBloqueo(API, async () => {
      const guardado = await this.store.leer(API)
      const forzar = tokenFallido !== undefined
      if (this.vigente(guardado) && (!forzar || guardado.access_token !== tokenFallido)) {
        this.cache = guardado
        return guardado.access_token
      }
      let nuevo: TokenGuardado | null = null
      if (guardado?.refresh_token) {
        try {
          nuevo = await this.pedirToken({ grant_type: 'refresh_token', refresh_token: guardado.refresh_token })
        } catch (e) {
          log.warn('factus.refresh_fallo', { error: e as Error })
        }
      }
      if (!nuevo) {
        const cfg = this.config()
        nuevo = await this.pedirToken({ grant_type: 'password', username: cfg.username, password: cfg.password })
      }
      await this.store.guardar(API, nuevo)
      this.cache = nuevo
      return nuevo.access_token
    })
  }

  private async pedirToken(params: Record<string, string>): Promise<TokenGuardado> {
    const cfg = this.config()
    if (!cfg.clientId || !cfg.clientSecret || !cfg.username || !cfg.password) {
      throw new ErrorApi('factus', 0, null, 'Faltan credenciales de Factus (FACTUS_CLIENT_ID, _SECRET, _USERNAME, _PASSWORD)')
    }
    const grant = params.grant_type as 'password' | 'refresh_token'
    this.pedidos[grant]++
    const cuerpo = new URLSearchParams({ ...params, client_id: cfg.clientId, client_secret: cfg.clientSecret })
    const r = await pedir(`${cfg.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo.toString(),
      timeoutMs: 15_000,
    })
    if (r.status !== 200 || !r.cuerpo?.access_token) {
      throw new ErrorApi('factus', r.status, r.cuerpo, `Factus /oauth/token (${grant}): ${mensajeDe(r.cuerpo, `HTTP ${r.status}`)}`)
    }
    log.info('factus.token', { grant, expira_en_s: r.cuerpo.expires_in })
    return {
      access_token: r.cuerpo.access_token,
      refresh_token: r.cuerpo.refresh_token ?? null,
      expires_at: Date.now() + Number(r.cuerpo.expires_in ?? 3600) * 1000,
    }
  }

  /** Para /api/salud: minutos que le quedan al token en memoria. */
  minutosRestantes(): number | null {
    return this.cache?.expires_at ? Math.round((this.cache.expires_at - Date.now()) / 60000) : null
  }
}

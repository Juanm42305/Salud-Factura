// Dónde se guardan los tokens de las dos APIs.
// En base de datos para que todas las instancias (Vercel crea varias) compartan el MISMO token:
// Factus Pay revoca el token anterior en cada /auth, así que dos instancias autenticándose
// por su cuenta se tumbarían entre sí.
import { db } from '../db'
import { conMutex } from '../lock'

export interface TokenGuardado {
  access_token: string
  refresh_token?: string | null
  expires_at?: number | null // epoch en ms
}

export interface TokenStore {
  leer(api: string): Promise<TokenGuardado | null>
  guardar(api: string, t: TokenGuardado): Promise<void>
  /** Ejecuta fn con un candado exclusivo por API (entre peticiones y entre instancias). */
  conBloqueo<T>(api: string, fn: () => Promise<T>): Promise<T>
}

export class MemoriaTokenStore implements TokenStore {
  private datos = new Map<string, TokenGuardado>()
  async leer(api: string) {
    return this.datos.get(api) ?? null
  }
  async guardar(api: string, t: TokenGuardado) {
    this.datos.set(api, { ...t })
  }
  conBloqueo<T>(api: string, fn: () => Promise<T>) {
    return conMutex(`token:${api}`, fn)
  }
}

export class DbTokenStore implements TokenStore {
  async leer(api: string): Promise<TokenGuardado | null> {
    const r = await db.q1<{ access_token: string; refresh_token: string | null; expires_at: string | Date | null }>(
      'select access_token, refresh_token, expires_at from api_tokens where api = $1',
      [api],
    )
    if (!r) return null
    return {
      access_token: r.access_token,
      refresh_token: r.refresh_token,
      expires_at: r.expires_at ? new Date(r.expires_at).getTime() : null,
    }
  }

  async guardar(api: string, t: TokenGuardado) {
    await db.q(
      `insert into api_tokens (api, access_token, refresh_token, expires_at, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (api) do update set access_token = excluded.access_token,
         refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, updated_at = now()`,
      [api, t.access_token, t.refresh_token ?? null, t.expires_at ? new Date(t.expires_at).toISOString() : null],
    )
  }

  conBloqueo<T>(api: string, fn: () => Promise<T>): Promise<T> {
    // Mutex local + candado de Postgres (pg_advisory_xact_lock) para coordinar varias instancias
    return conMutex(`token:${api}`, () =>
      db.tx(async (c) => {
        await c.q('select pg_advisory_xact_lock(hashtext($1))', [`token:${api}`])
        return fn()
      }),
    )
  }
}

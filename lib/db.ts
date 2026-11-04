// Acceso a PostgreSQL (Supabase u otro). Solo se usa en el servidor.
import type { Pool, PoolClient } from 'pg'
import { env } from './env'

export interface Consultor {
  q<T = any>(sql: string, params?: unknown[]): Promise<T[]>
  q1<T = any>(sql: string, params?: unknown[]): Promise<T | null>
}

/** Implementación intercambiable (las pruebas inyectan otra). */
export interface DriverDb {
  query(sql: string, params: unknown[]): Promise<any[]>
  tx<T>(fn: (c: Consultor) => Promise<T>): Promise<T>
}

const g = globalThis as unknown as { __sfDriver?: DriverDb; __sfPool?: Promise<Pool>; __sfPoolUrl?: string }

export function setDriver(d: DriverDb) {
  g.__sfDriver = d
}

async function crearPool(url: string): Promise<Pool> {
  const mod = await import('pg')
  const pg = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod
  // numeric → number (los montos de la demo caben sin pérdida en un double)
  pg.types.setTypeParser(1700, (v: string) => Number(v))
  const local = /localhost|127\.0\.0\.1/.test(url)
  return new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    ssl: local ? undefined : { rejectUnauthorized: false },
  })
}

async function pool(): Promise<Pool> {
  if (!env.databaseUrl) throw new Error('Falta DATABASE_URL')
  // Si DATABASE_URL cambia con el servidor corriendo (se editó el .env), se crea un pool nuevo
  if (!g.__sfPool || g.__sfPoolUrl !== env.databaseUrl) {
    const anterior = g.__sfPool
    g.__sfPoolUrl = env.databaseUrl
    g.__sfPool = crearPool(env.databaseUrl).catch((e) => {
      g.__sfPool = undefined
      throw e
    })
    anterior?.then((p) => p.end()).catch(() => {})
  }
  return g.__sfPool
}

function consultor(ejecutar: (sql: string, params: unknown[]) => Promise<any[]>): Consultor {
  return {
    q: (sql, params = []) => ejecutar(sql, params),
    q1: async (sql, params = []) => (await ejecutar(sql, params))[0] ?? null,
  }
}

const driverPg: DriverDb = {
  async query(sql, params) {
    const p = await pool()
    return (await p.query(sql, params as any[])).rows
  },
  async tx(fn) {
    const p = await pool()
    const cliente: PoolClient = await p.connect()
    try {
      await cliente.query('begin')
      const r = await fn(consultor(async (sql, params) => (await cliente.query(sql, params as any[])).rows))
      await cliente.query('commit')
      return r
    } catch (e) {
      await cliente.query('rollback').catch(() => {})
      throw e
    } finally {
      cliente.release()
    }
  },
}

const driver = () => g.__sfDriver ?? driverPg

export const db: Consultor & { tx: DriverDb['tx'] } = {
  ...consultor((sql, params) => driver().query(sql, params)),
  tx: (fn) => driver().tx(fn),
}

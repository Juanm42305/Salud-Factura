// Base PostgreSQL real en memoria (PGlite) para probar los servicios con el mismo db/schema.sql y db/seed.sql.
// No toca Supabase: cada llamada crea una base nueva y vacía.
import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { setDriver, type Consultor, type DriverDb } from '../lib/db'

const leer = (archivo: string) => readFileSync(new URL(`../db/${archivo}`, import.meta.url), 'utf8')

function consultor(ejecutar: (sql: string, params: unknown[]) => Promise<any[]>): Consultor {
  return {
    q: (sql, params = []) => ejecutar(sql, params),
    q1: async (sql, params = []) => (await ejecutar(sql, params))[0] ?? null,
  }
}

export async function baseEnMemoria() {
  // numeric → number, igual que lib/db.ts con pg
  const pg = new PGlite({ parsers: { 1700: (v: string) => Number(v) } })
  await pg.exec(leer('schema.sql'))
  await pg.exec(leer('seed.sql'))

  let enTx: Transaction | null = null
  const driver: DriverDb = {
    // Una consulta fuera de la transacción mientras hay una abierta usaría la misma conexión
    // (PGlite tiene una sola); se manda por la transacción para no bloquearse.
    query: async (sql, params) => ((enTx ?? pg) as PGlite).query(sql, params as any[]).then((r) => r.rows as any[]),
    tx: (fn) =>
      pg.transaction(async (t) => {
        enTx = t
        try {
          return await fn(consultor(async (sql, params) => (await t.query(sql, params as any[])).rows as any[]))
        } finally {
          enTx = null
        }
      }),
  }
  setDriver(driver)
  return pg
}

// Corre db/schema.sql y db/seed.sql contra DATABASE_URL.
// Uso: node --env-file=.env scripts/migrar.mjs   (o pega los dos archivos en el SQL Editor de Supabase)
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL')
  process.exit(1)
}
const local = /localhost|127\.0\.0\.1/.test(url)
const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } })
await client.connect()
for (const archivo of ['db/schema.sql', 'db/seed.sql']) {
  const sql = await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8')
  await client.query(sql)
  console.log(`✔ ${archivo}`)
}
await client.end()

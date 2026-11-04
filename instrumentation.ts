// Next.js llama a register() una vez al arrancar el servidor.
// Con RUN_WORKER=true (Railway/Render) arranca la cola y el polling en el mismo proceso.
export async function register() {
  // Abre la conexión a la base al arrancar (~1,5 s de TLS + login), para que el primer clic no la pague
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DATABASE_URL) {
    const { db } = await import('./lib/db')
    void db.q('select 1').catch(() => {})
  }
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.RUN_WORKER === 'true') {
    const { iniciarWorker } = await import('./lib/services/worker')
    iniciarWorker()
  }
}

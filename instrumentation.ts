// Next.js llama a register() una vez al arrancar el servidor.
// Con RUN_WORKER=true (Railway/Render) arranca la cola y el polling en el mismo proceso.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.RUN_WORKER === 'true') {
    const { iniciarWorker } = await import('./lib/services/worker')
    iniciarWorker()
  }
}

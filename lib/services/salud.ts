// GET /api/salud: prueba de vida que se muestra al jurado (ambas APIs responden en sandbox).
import { db } from '../db'
import { env, urlsEnSandbox } from '../env'
import { factus, factusAuth, pay } from '../factus'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function estadoSalud() {
  const inicio = Date.now()
  const [base, fac, py] = await Promise.allSettled([
    db.q1('select now() as ahora'),
    (async () => {
      const api = factus()
      const rangos = await api.rangosNumeracion()
      return {
        modo: api.modo,
        token_minutos_restantes: api.modo === 'mock' ? null : factusAuth().minutosRestantes(),
        rango_configurado: env.factusRangoFacturas,
        rango_notas_configurado: env.factusRangoNotas,
        rangos: rangos.map((r) => ({
          id: r.id,
          documento: r.document,
          prefijo: r.prefix,
          desde: r.from,
          hasta: r.to,
          actual: r.current,
          vencido: r.is_expired,
        })),
      }
    })(),
    (async () => {
      const api = pay()
      const p = await api.ping()
      if (!p.ok) throw new Error(p.detalle)
      return { modo: api.modo, detalle: p.detalle }
    })(),
  ])

  const resultado = <T,>(r: PromiseSettledResult<T>) =>
    r.status === 'fulfilled' ? { ok: true, ...(r.value as object) } : { ok: false, error: msg(r.reason) }

  const factusR = resultado(fac) as { ok: boolean; modo?: string }
  const payR = resultado(py) as { ok: boolean; modo?: string }
  const llave = env.payWebhookKey
  const urlPublica = env.appPublicUrl
  const ok = base.status === 'fulfilled' && factusR.ok && payR.ok

  return {
    ok,
    // Lista para el jurado: ambas APIs reales en sandbox, webhook con HTTPS y llave larga
    demo_lista:
      ok &&
      urlsEnSandbox() &&
      factusR.modo === 'sandbox' &&
      payR.modo === 'sandbox' &&
      llave.length >= 32 &&
      urlPublica.startsWith('https://'),
    base_datos: base.status === 'fulfilled' ? { ok: true } : { ok: false, error: msg(base.reason) },
    factus: factusR,
    factus_pay: payR,
    webhook: {
      url: urlPublica ? `${urlPublica}/webhooks/factus-pay` : '(configura APP_PUBLIC_URL)',
      https: urlPublica.startsWith('https://'),
      llave_configurada: llave.length >= 32,
    },
    sandbox: urlsEnSandbox(),
    worker: env.runWorker,
    ms: Date.now() - inicio,
  }
}

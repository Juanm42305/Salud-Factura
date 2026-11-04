// Logger en JSON que nunca imprime credenciales: filtra Authorization, client_secret,
// password, tokens y el parámetro key del webhook.
const CLAVES_SENSIBLES = /^(authorization|client_secret|password|token|access_token|refresh_token|key|x-factus-access-key|cookie)$/i

export function redactar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 6) return '[…]'
  if (typeof valor === 'string') {
    return valor
      .replace(/([?&]key=)[^&\s"']+/gi, '$1***')
      .replace(/(Bearer\s+)[A-Za-z0-9._|\-]+/g, '$1***')
      .replace(/(client_secret=|password=|refresh_token=)[^&\s"']+/gi, '$1***')
  }
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1))
  if (valor instanceof Error) return { nombre: valor.name, mensaje: redactar(valor.message, profundidad + 1) }
  if (valor && typeof valor === 'object') {
    const salida: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor)) {
      salida[k] = CLAVES_SENSIBLES.test(k) ? '***' : redactar(v, profundidad + 1)
    }
    return salida
  }
  return valor
}

function escribir(nivel: 'info' | 'warn' | 'error', evento: string, datos?: Record<string, unknown>) {
  const linea = JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...(redactar(datos ?? {}) as object) })
  if (nivel === 'error') console.error(linea)
  else if (nivel === 'warn') console.warn(linea)
  else console.log(linea)
}

export const log = {
  info: (evento: string, datos?: Record<string, unknown>) => escribir('info', evento, datos),
  warn: (evento: string, datos?: Record<string, unknown>) => escribir('warn', evento, datos),
  error: (evento: string, datos?: Record<string, unknown>) => escribir('error', evento, datos),
}

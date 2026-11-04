// El frontend SOLO habla con el backend propio (/api/*). Nunca llama a Factus directo.
export class ErrorCliente extends Error {
  constructor(mensaje: string, public status: number, public datos: any) {
    super(mensaje)
  }
}

export async function api<T = any>(ruta: string, opciones: { metodo?: string; json?: unknown } = {}): Promise<T> {
  const metodo = opciones.metodo ?? (opciones.json !== undefined ? 'POST' : 'GET')
  const res = await fetch(ruta, {
    method: metodo,
    headers: opciones.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opciones.json !== undefined ? JSON.stringify(opciones.json) : undefined,
    cache: 'no-store',
  })
  const datos = await res.json().catch(() => null)
  if (!res.ok) throw new ErrorCliente(datos?.error ?? `HTTP ${res.status}`, res.status, datos)
  return datos as T
}

export const pesos = (n: unknown) => `$${Math.round(Number(n ?? 0)).toLocaleString('es-CO')}`

export const fechaHora = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })
    : '—'

export const corto = (s: string | null | undefined, n = 14) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : '—')

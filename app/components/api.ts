// Las operaciones hablan con /api/*. Supabase se utiliza directamente solo para Auth.
import { cabecerasSesion } from './supabase'
export class ErrorCliente extends Error {
  constructor(mensaje: string, public status: number, public datos: any) {
    super(mensaje)
  }
}

export async function api<T = any>(ruta: string, opciones: { metodo?: string; json?: unknown } = {}): Promise<T> {
  const metodo = opciones.metodo ?? (opciones.json !== undefined ? 'POST' : 'GET')
  const autorizacion = await cabecerasSesion()
  let res: Response
  try { res = await fetch(ruta, {
    method: metodo,
    headers: { ...autorizacion, ...(opciones.json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: opciones.json !== undefined ? JSON.stringify(opciones.json) : undefined,
    cache: 'no-store',
  }) } catch {
    throw new ErrorCliente('No se pudo conectar con el servidor. Revisa tu conexión. Si estabas enviando una operación, consulta su estado antes de repetirla.', 0, null)
  }
  const datos = await res.json().catch(() => null)
  if (!res.ok) throw new ErrorCliente(datos?.error ?? `HTTP ${res.status}`, res.status, datos)
  if (datos === null) throw new ErrorCliente('El servidor devolvió una respuesta inesperada. Actualiza la información antes de continuar.', res.status, null)
  return datos as T
}

export const pesos = (n: unknown) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number.isFinite(Number(n)) ? Number(n) : 0)

export const fechaHora = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })
    : '—'

export const corto = (s: string | null | undefined, n = 14) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : '—')

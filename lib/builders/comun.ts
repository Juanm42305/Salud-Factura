/** Dinero con 2 decimales como string, como lo pide Factus ("4700.00"). */
export const dinero = (n: number): string => (Math.round(Number(n) * 100) / 100).toFixed(2)

export interface ItemCalculable {
  quantity: string | number
  price: string | number
  discount_rate?: string | number
}

/** Suma de los ítems (servicios de salud excluidos de IVA: no se suman impuestos). */
export function totalItems(items: ItemCalculable[]): number {
  const t = items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.price) * (1 - Number(i.discount_rate ?? 0) / 100),
    0,
  )
  return Math.round(t * 100) / 100
}

/** Dígito de verificación del NIT (algoritmo DIAN). */
export function dvNit(nit: string): string {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const digitos = nit.replace(/\D/g, '').split('').reverse()
  const suma = digitos.reduce((s, d, i) => s + Number(d) * (pesos[i] ?? 0), 0)
  const r = suma % 11
  return String(r > 1 ? 11 - r : r)
}

/** Fecha YYYY-MM-DD en hora de Colombia. */
export function fechaColombia(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d)
}

/** Hora HH:mm:ss en hora de Colombia. */
export function horaColombia(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d)
}

export function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T12:00:00-05:00`)
  d.setUTCDate(d.getUTCDate() + dias)
  return fechaColombia(d)
}

export const recortar = (s: string, max = 500) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
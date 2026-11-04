// Esquema de referencias (sección 11.1). Todo se deriva de la admisión, así cada operación
// externa es idempotente y queda trazada por el mismo número.
export const pad = (n: number, largo = 6) => String(n).padStart(largo, '0')

export const anioColombia = (d: Date = new Date()) =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric' }).format(d))

/** ADM-2026-000123 */
export const codigoAdmision = (id: number, fecha: Date = new Date()) => `ADM-${anioColombia(fecha)}-${pad(id)}`

/** ATN-2026-000123: la atención usa el mismo número de la admisión. */
export const codigoAtencion = (codigoAdm: string) => codigoAdm.replace(/^ADM-/, 'ATN-')

/** ADM-2026-000123-COP (si un pago falló y se cobra de nuevo: ADM-2026-000123-COP-2) */
export const referenciaRecaudo = (codigoAdm: string, concepto: string, intento = 1) =>
  intento > 1 ? `${codigoAdm}-${concepto}-${intento}` : `${codigoAdm}-${concepto}`

/** Convierte las fechas de Factus Pay ("28-10-2026 08:23:04 PM", hora Colombia) o ISO a Date. */
export function parsearFechaFactus(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i.exec(s.trim())
  if (m) {
    let hora = Number(m[4])
    const periodo = m[7]?.toUpperCase()
    if (periodo === 'PM' && hora < 12) hora += 12
    if (periodo === 'AM' && hora === 12) hora = 0
    const iso = `${m[3]}-${m[2]}-${m[1]}T${String(hora).padStart(2, '0')}:${m[5]}:${m[6]}-05:00`
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

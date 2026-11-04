'use client'
import { useState, type ReactNode } from 'react'
import { cabecerasSesion } from './supabase'

const COLORES: Record<string, string> = {
  creada: 'gris', cobro_pendiente: 'ambar', pagada: 'azul', copago_facturado: 'verde',
  atencion_cerrada: 'azul', facturada_eps: 'verde', glosada: 'ambar', pagada_eps: 'verde',
  cobro_fallido: 'rojo', cobro_vencido: 'ambar', requiere_revision: 'rojo',
  validada: 'verde', bloqueada: 'rojo', rechazada: 'rojo', error: 'rojo', enviando: 'azul', pendiente: 'gris',
  creado: 'gris', ready: 'ambar', started: 'azul', paid: 'verde', rejected: 'rojo', failed: 'rojo', revision: 'rojo',
  registrada: 'ambar', respondida: 'gris', aceptada: 'azul', cerrada: 'verde',
}

export function Estado({ valor }: { valor: string | null | undefined }) {
  if (!valor) return null
  const nombres: Record<string, string> = { ready: 'Esperando pago', started: 'Pago en curso', paid: 'Pagado', rejected: 'Rechazado', failed: 'Fallido', revision: 'Requiere revisión', copago_facturado: 'Copago facturado', facturada_eps: 'Facturada a EPS' }
  return <span className={`estado ${COLORES[valor] ?? 'gris'}`}>{nombres[valor] ?? valor.replace(/_/g, ' ')}</span>
}

export interface HallazgoUI {
  codigo: string
  nivel: 'error' | 'advertencia'
  campo: string
  mensaje: string
}

export function Hallazgos({ lista }: { lista?: HallazgoUI[] | null }) {
  if (!lista?.length) return null
  return (
    <ul className="hallazgos">
      {lista.map((h, i) => (
        <li key={`${h.codigo}-${i}`} className={h.nivel}>
          <b>{h.codigo}</b>
          <span>{h.mensaje}</span>
          <code>{h.campo}</code>
        </li>
      ))}
    </ul>
  )
}

const PASOS = [
  ['creada', 'Admisión'],
  ['cobro_pendiente', 'QR generado'],
  ['pagada', 'Pagada'],
  ['copago_facturado', 'SS-Recaudo'],
  ['atencion_cerrada', 'Atención cerrada'],
  ['facturada_eps', 'SS-CUFE a la EPS'],
] as const

/** Línea de estados de la admisión (sección 11.5). */
export function LineaEstados({ estado }: { estado: string }) {
  const orden: string[] = PASOS.map((p) => p[0])
  const extra: Record<string, string> = { cobro_vencido: 'cobro_pendiente', cobro_fallido: 'cobro_pendiente', glosada: 'facturada_eps', pagada_eps: 'facturada_eps' }
  const actual = orden.indexOf(extra[estado] ?? estado)
  return (
    <div className="linea" aria-label={`Progreso de la atención: ${estado.replace(/_/g, ' ')}`}>
      {PASOS.map(([clave, nombre], i) => (
        <div key={clave} className={`p ${i < actual || (i === actual && i === orden.length - 1) ? 'hecho' : ''} ${i === actual ? 'actual' : ''}`}>
          {nombre}
        </div>
      ))}
    </div>
  )
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'error' | 'ok' | 'info' | 'alerta'; children: ReactNode }) {
  return <div className={`aviso ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function Cargando({ texto = 'Cargando información…' }: { texto?: string }) {
  return <div className="cargando" role="status"><span className="spinner" aria-hidden="true" />{texto}</div>
}

export function Busqueda({ valor, cambiar, etiqueta = 'Buscar', placeholder = 'Buscar por paciente, EPS o código…' }: { valor: string; cambiar: (valor: string) => void; etiqueta?: string; placeholder?: string }) {
  return <label className="busqueda"><span>{etiqueta}</span><input type="search" value={valor} onChange={e => cambiar(e.target.value)} placeholder={placeholder} /></label>
}

/** Botones para ver el PDF y el XML descargados desde Factus. */
export function Descargas({ base, id }: { base: 'facturas' | 'notas-credito'; id: number }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function descargar(formato: 'pdf' | 'xml') {
    if (ocupado) return
    setOcupado(true); setError(null)
    try {
      const res = await fetch(`/api/${base}/${id}/${formato}`, { headers: await cabecerasSesion(), cache: 'no-store' })
      if (!res.ok) {
        const datos = await res.json().catch(() => null)
        throw new Error(datos?.error ?? 'No se pudo descargar el documento.')
      }
      const blob = await res.blob()
      const tipoEsperado = formato === 'pdf' ? /application\/pdf/i : /(?:application|text)\/xml/i
      if (!tipoEsperado.test(blob.type)) throw new Error('El servidor no devolvió un documento válido.')
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url; enlace.download = `${base}-${id}.${formato}`
      document.body.appendChild(enlace); enlace.click(); enlace.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar el documento.') }
    finally { setOcupado(false) }
  }
  return (
    <>
      <button className="btn sec chico" disabled={ocupado} onClick={() => { void descargar('pdf') }}>PDF</button>
      <button className="btn sec chico" disabled={ocupado} onClick={() => { void descargar('xml') }}>XML</button>
      {ocupado && <span role="status" className="mudo">Descargando…</span>}
      {error && <span role="alert" className="aviso error">{error}</span>}
    </>
  )
}

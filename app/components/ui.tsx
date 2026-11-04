'use client'
import type { ReactNode } from 'react'

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
  return <span className={`estado ${COLORES[valor] ?? 'gris'}`}>{valor.replace(/_/g, ' ')}</span>
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
    <div className="linea">
      {PASOS.map(([clave, nombre], i) => (
        <div key={clave} className={`p ${i < actual || (i === actual && i === orden.length - 1) ? 'hecho' : ''} ${i === actual ? 'actual' : ''}`}>
          {nombre}
        </div>
      ))}
    </div>
  )
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'error' | 'ok' | 'info' | 'alerta'; children: ReactNode }) {
  return <div className={`aviso ${tipo}`}>{children}</div>
}

/** Botones para ver el PDF y el XML descargados desde Factus. */
export function Descargas({ base, id }: { base: 'facturas' | 'notas-credito'; id: number }) {
  return (
    <>
      <a className="btn sec chico" href={`/api/${base}/${id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
      <a className="btn sec chico" href={`/api/${base}/${id}/xml`} target="_blank" rel="noreferrer">XML</a>
    </>
  )
}

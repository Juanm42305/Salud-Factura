'use client'
import { useEffect, useState } from 'react'
import type { CarteraDatos } from '../components/tipos'
import { api, pesos } from '../components/api'
import { Aviso, Busqueda, Cargando } from '../components/ui'

export default function Cartera() {
  const [d, setD] = useState<CarteraDatos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [soloSaldo, setSoloSaldo] = useState(false)
  const [orden, setOrden] = useState('nombre')
  const cargar = () => { setCargando(true); setError(null); return api<CarteraDatos>('/api/cartera').then(setD).catch((e) => setError(e.message)).finally(() => setCargando(false)) }
  useEffect(() => {
    void cargar()
  }, [])

  const t = d?.totales
  const filas = (d?.eps ?? []).filter((e) => `${e.razon_social} ${e.nit}`.toLowerCase().includes(busqueda.toLowerCase()) && (!soloSaldo || Number(e.saldo) > 0)).sort((a, b) => orden === 'saldo' ? Number(b.saldo) - Number(a.saldo) : a.razon_social.localeCompare(b.razon_social, 'es'))
  return (
    <>
      <h1>Cartera por EPS</h1>
      <p className="sub">Cada peso con trazabilidad: copago recaudado → factura SS-Recaudo → descuento en la SS-CUFE → glosa → nota crédito.</p>
      {error && <Aviso tipo="error">No se pudo actualizar la cartera: {error}. Reintenta con el botón Actualizar.</Aviso>}

      {t && (
        <div className="rejilla cuatro" style={{ marginBottom: 18 }}>
          <div className="tarjeta kpi"><div className="e">Facturado a EPS (neto)</div><div className="v">{pesos(t.facturado)}</div></div>
          <div className="tarjeta kpi"><div className="e">Copagos recaudados y facturados</div><div className="v">{pesos(t.copagos)}</div></div>
          <div className="tarjeta kpi"><div className="e">Glosado</div><div className="v">{pesos(t.glosado)}</div></div>
          <div className="tarjeta kpi"><div className="e">Saldo por cobrar</div><div className="v">{pesos(t.saldo)}</div></div>
        </div>
      )}

      <div className="tarjeta">
        <h2>Balance por entidad</h2>
        <div className="filtros">
          <Busqueda valor={busqueda} cambiar={setBusqueda} placeholder="Buscar EPS por nombre o NIT…" />
          <label>Ordenar por<select value={orden} onChange={e => setOrden(e.target.value)}><option value="nombre">Nombre de EPS</option><option value="saldo">Mayor saldo</option></select></label>
          <label className="check"><input type="checkbox" checked={soloSaldo} onChange={e => setSoloSaldo(e.target.checked)} />Con saldo pendiente</label>
        </div>
        {cargando ? <Cargando texto="Consultando cartera…" /> : filas.length === 0 ? <p className="vacio">{error ? 'La información no está disponible.' : 'No hay EPS que coincidan con estos filtros.'}</p> : <table>
          <thead>
            <tr>
              <th>EPS</th><th className="num">Facturas</th><th className="num">Servicios</th><th className="num">Copagos</th>
              <th className="num">Facturado neto</th><th className="num">Glosado</th><th className="num">Notas crédito</th>
              <th className="num">Saldo</th><th className="num">Glosas abiertas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((e) => (
              <tr key={e.id}>
                <td>{e.razon_social}<div className="mudo">NIT {e.nit}</div></td>
                <td className="num">{e.facturas}</td>
                <td className="num">{pesos(e.servicios)}</td>
                <td className="num">{pesos(e.copagos)}</td>
                <td className="num">{pesos(e.facturado)}</td>
                <td className="num">{pesos(e.glosado)}</td>
                <td className="num">{pesos(e.notas_credito)}</td>
                <td className="num"><b>{pesos(e.saldo)}</b></td>
                <td className="num">{e.glosas_abiertas}</td>
              </tr>
            ))}
          </tbody>
        </table>}
        <div className="acciones"><button className="btn sec" onClick={cargar} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar'}</button></div>
        <p className="nota">Los indicadores corresponden al total de la cartera. El saldo se calcula con facturas y notas crédito; no incluye registro de pagos de EPS.</p>
      </div>
    </>
  )
}

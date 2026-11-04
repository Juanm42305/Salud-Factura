'use client'
import { useEffect, useState } from 'react'
import { api, pesos } from '../components/api'

export default function Cartera() {
  const [d, setD] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const cargar = () => api('/api/cartera').then(setD).catch((e) => setError(e.message))
  useEffect(() => {
    void cargar()
  }, [])

  const t = d?.totales
  return (
    <>
      <h1>Cartera por EPS</h1>
      <p className="sub">Cada peso con trazabilidad: copago recaudado → factura SS-Recaudo → descuento en la SS-CUFE → glosa → nota crédito.</p>
      {error && <div className="aviso error">{error}</div>}

      {t && (
        <div className="rejilla cuatro" style={{ marginBottom: 18 }}>
          <div className="tarjeta kpi"><div className="e">Facturado a EPS (neto)</div><div className="v">{pesos(t.facturado)}</div></div>
          <div className="tarjeta kpi"><div className="e">Copagos recaudados y facturados</div><div className="v">{pesos(t.copagos)}</div></div>
          <div className="tarjeta kpi"><div className="e">Glosado</div><div className="v">{pesos(t.glosado)}</div></div>
          <div className="tarjeta kpi"><div className="e">Saldo por cobrar</div><div className="v">{pesos(t.saldo)}</div></div>
        </div>
      )}

      <div className="tarjeta">
        <table>
          <thead>
            <tr>
              <th>EPS</th><th className="num">Facturas</th><th className="num">Servicios</th><th className="num">Copagos</th>
              <th className="num">Facturado neto</th><th className="num">Glosado</th><th className="num">Notas crédito</th>
              <th className="num">Saldo</th><th className="num">Glosas abiertas</th>
            </tr>
          </thead>
          <tbody>
            {(d?.eps ?? []).map((e: any) => (
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
        </table>
        <div className="acciones"><button className="btn sec" onClick={cargar}>Actualizar</button></div>
      </div>
    </>
  )
}

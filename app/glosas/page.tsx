'use client'
import { useEffect, useState } from 'react'
import { api, fechaHora, pesos } from '../components/api'
import { Aviso, Descargas, Estado, Hallazgos, type HallazgoUI } from '../components/ui'

const TIPOS: Record<string, string> = {
  servicio_no_aceptado: 'Servicio no aceptado en parte (concepto 1)',
  factura_rechazada: 'Factura rechazada completa (concepto 2, anulación)',
  descuento_pactado: 'Descuento pactado (concepto 3)',
  diferencia_tarifa: 'Diferencia de tarifa (concepto 4)',
}

export default function Glosas() {
  const [facturas, setFacturas] = useState<any[]>([])
  const [glosas, setGlosas] = useState<any[]>([])
  const [facturaId, setFacturaId] = useState<number | null>(null)
  const [item, setItem] = useState('')
  const [tipo, setTipo] = useState('diferencia_tarifa')
  const [valor, setValor] = useState('5000')
  const [motivo, setMotivo] = useState('Tarifa facturada superior a la pactada en el contrato')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string; hallazgos?: HallazgoUI[] } | null>(null)
  const [ocupado, setOcupado] = useState<number | 'nueva' | null>(null)

  const cargar = () =>
    Promise.all([
      api('/api/facturas?tipo=SS-CUFE&estado=validada').then((f) => {
        setFacturas(f)
        setFacturaId((x) => x ?? f[0]?.id ?? null)
      }),
      api('/api/glosas').then(setGlosas),
    ]).catch(() => {})
  useEffect(() => {
    cargar()
  }, [])

  const factura = facturas.find((f) => f.id === facturaId)
  useEffect(() => {
    setItem(factura?.items?.[0]?.code_reference ?? '')
  }, [facturaId, facturas.length])

  async function registrar() {
    setOcupado('nueva')
    setMsg(null)
    try {
      await api('/api/glosas', { json: { factura_id: facturaId, item: item || null, tipo, valor: Number(valor), motivo } })
      await cargar()
      setMsg({ tipo: 'ok', texto: 'Glosa registrada. Acéptala para emitir la nota crédito o recházala.' })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setOcupado(null)
    }
  }

  async function accion(id: number, que: 'aceptar' | 'rechazar') {
    setOcupado(id)
    setMsg(null)
    try {
      const r = await api(`/api/glosas/${id}/${que}`, { metodo: 'POST' })
      await cargar()
      setMsg({ tipo: 'ok', texto: que === 'aceptar' ? `Nota crédito ${r?.numero ?? ''} validada; la cartera de la EPS baja en ${pesos(r?.total)}` : 'Glosa respondida: no se emite nota crédito' })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message, hallazgos: e.datos?.hallazgos })
      await cargar()
    } finally {
      setOcupado(null)
    }
  }

  return (
    <>
      <h1>Glosas y notas crédito</h1>
      <p className="sub">Cada glosa aceptada termina en una nota crédito ligada a su factura SS-CUFE: no queda cartera sin explicar.</p>

      {msg && (
        <Aviso tipo={msg.tipo}>
          {msg.texto}
          <Hallazgos lista={msg.hallazgos} />
        </Aviso>
      )}

      <div className="rejilla unodos">
        <div className="tarjeta">
          <h2>Registrar glosa</h2>
          {facturas.length === 0 ? (
            <p className="vacio">No hay facturas SS-CUFE validadas todavía.</p>
          ) : (
            <>
              <label>Factura a la EPS</label>
              <select value={facturaId ?? ''} onChange={(e: any) => setFacturaId(Number(e.target.value))}>
                {facturas.map((f) => (
                  <option key={f.id} value={f.id}>{f.numero} · {f.eps} · {pesos(f.total_neto)}</option>
                ))}
              </select>
              <label>Ítem glosado</label>
              <select value={item} onChange={(e: any) => setItem(e.target.value)}>
                {(factura?.items ?? []).map((i: any) => (
                  <option key={i.code_reference} value={i.code_reference}>{i.code_reference} · {i.name} · {pesos(i.price)}</option>
                ))}
              </select>
              <label>Tipo de glosa</label>
              <select value={tipo} onChange={(e: any) => setTipo(e.target.value)}>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label>Valor glosado</label>
              <input type="number" min="1" value={valor} onChange={(e: any) => setValor(e.target.value)} />
              <label>Motivo</label>
              <input type="text" value={motivo} onChange={(e: any) => setMotivo(e.target.value)} />
              <div className="acciones">
                <button className="btn" onClick={registrar} disabled={ocupado !== null || !facturaId}>Registrar glosa</button>
              </div>
            </>
          )}
        </div>

        <div className="tarjeta">
          <h2>Glosas</h2>
          {glosas.length === 0 ? (
            <p className="vacio">Sin glosas registradas.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Factura</th><th>Glosa</th><th className="num">Valor</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {glosas.map((g) => (
                  <tr key={g.id}>
                    <td className="nowrap">{g.factura_numero}<div className="mudo">{g.eps}</div></td>
                    <td>{TIPOS[g.tipo]?.split(' (')[0]}<div className="mudo">{g.motivo} · {fechaHora(g.created_at)}</div></td>
                    <td className="num">{pesos(g.valor)}</td>
                    <td>
                      <Estado valor={g.estado} />
                      {g.nota_numero && <div className="mudo">NC {g.nota_numero}</div>}
                      {g.nota_error && <div className="mudo">{g.nota_error}</div>}
                    </td>
                    <td>
                      <div className="acciones" style={{ marginTop: 0 }}>
                        {(g.estado === 'registrada' || g.estado === 'aceptada') && (
                          <button className="btn chico" disabled={ocupado !== null} onClick={() => accion(g.id, 'aceptar')}>
                            {ocupado === g.id ? '…' : 'Aceptar → NC'}
                          </button>
                        )}
                        {g.estado === 'registrada' && (
                          <button className="btn sec chico" disabled={ocupado !== null} onClick={() => accion(g.id, 'rechazar')}>Rechazar</button>
                        )}
                        {g.nota_id && g.nota_estado === 'validada' && <Descargas base="notas-credito" id={g.nota_id} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

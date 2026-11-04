'use client'
import { useEffect, useState } from 'react'
import type { Factura, Glosa } from '../components/tipos'
import { api, fechaHora, pesos } from '../components/api'
import { Aviso, Busqueda, Cargando, Descargas, Estado, Hallazgos, type HallazgoUI } from '../components/ui'

const TIPOS: Record<string, string> = {
  servicio_no_aceptado: 'Servicio no aceptado en parte (concepto 1)',
  factura_rechazada: 'Factura rechazada completa (concepto 2, anulación)',
  descuento_pactado: 'Descuento pactado (concepto 3)',
  diferencia_tarifa: 'Diferencia de tarifa (concepto 4)',
}

export default function Glosas() {
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [glosas, setGlosas] = useState<Glosa[]>([])
  const [facturaId, setFacturaId] = useState<number | null>(null)
  const [item, setItem] = useState('')
  const [tipo, setTipo] = useState('diferencia_tarifa')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string; hallazgos?: HallazgoUI[] } | null>(null)
  const [ocupado, setOcupado] = useState<number | 'nueva' | null>(null)

  const cargar = () => {
    setCargando(true); setErrorCarga(null)
    return Promise.all([
      api<Factura[]>('/api/facturas?tipo=SS-CUFE&estado=validada').then((f) => {
        setFacturas(f)
        setFacturaId((x) => x ?? f[0]?.id ?? null)
      }),
      api<Glosa[]>('/api/glosas').then(setGlosas),
    ]).catch(e => { setErrorCarga(e.message); throw e }).finally(() => setCargando(false))
  }
  useEffect(() => {
    void cargar().catch(() => {})
  }, [])

  const factura = facturas.find((f) => f.id === facturaId)
  useEffect(() => {
    setItem(factura?.items?.[0]?.code_reference ?? '')
  }, [facturaId, facturas.length])

  const valorValido = Number.isFinite(Number(valor)) && Number(valor) > 0 && Number(valor) <= Number(factura?.total ?? 0)

  const filtradas = glosas.filter(g => `${g.factura_numero} ${g.eps} ${g.motivo}`.toLowerCase().includes(busqueda.toLowerCase()))

  async function registrar() {
    if (!facturaId || !valorValido || !motivo.trim()) { setMsg({ tipo: 'error', texto: 'Elige una factura, escribe un motivo y un valor mayor a cero que no supere el total facturado.' }); return }
    setOcupado('nueva')
    setMsg(null)
    try {
      await api('/api/glosas', { json: { factura_id: facturaId, item: item || null, tipo, valor: Number(valor), motivo: motivo.trim() } })
      setValor(''); setMotivo('')
      await cargar().catch(() => {})
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
      await cargar().catch(() => {})
      setMsg({ tipo: 'ok', texto: que === 'aceptar' ? `Nota crédito ${r?.numero ?? ''} validada; la cartera de la EPS baja en ${pesos(r?.total)}` : 'Glosa respondida: no se emite nota crédito' })
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message, hallazgos: e.datos?.hallazgos })
      await cargar().catch(() => {})
    } finally {
      setOcupado(null)
    }
  }

  return (
    <>
      <h1>Glosas y notas crédito</h1>
      <p className="sub">Cada glosa aceptada termina en una nota crédito ligada a su factura SS-CUFE: no queda cartera sin explicar.</p>

      {errorCarga && <Aviso tipo="error">No se pudo cargar la información: {errorCarga}<div className="acciones"><button className="btn sec chico" disabled={cargando} onClick={() => { void cargar().catch(() => {}) }}>Reintentar</button></div></Aviso>}
      {msg && (
        <Aviso tipo={msg.tipo}>
          {msg.texto}
          <Hallazgos lista={msg.hallazgos} />
        </Aviso>
      )}

      <div className="rejilla unodos">
        <div className="tarjeta">
          <h2>Registrar glosa</h2>
          {cargando ? <Cargando /> : facturas.length === 0 ? (
            <p className="vacio">{errorCarga ? 'No se pudieron consultar las facturas disponibles.' : 'No hay facturas SS-CUFE validadas todavía.'}</p>
          ) : (
            <>
              <label htmlFor="campo-1">Factura a la EPS</label>
              <select disabled={ocupado !== null} id="campo-1" value={facturaId ?? ''} onChange={(e: any) => setFacturaId(Number(e.target.value))}>
                {facturas.map((f) => (
                  <option key={f.id} value={f.id}>{f.numero} · {f.eps} · {pesos(f.total_neto)}</option>
                ))}
              </select>
              <label htmlFor="campo-2">Ítem glosado</label>
              <select disabled={ocupado !== null} id="campo-2" value={item} onChange={(e: any) => setItem(e.target.value)}>
                {(factura?.items ?? []).map((i) => (
                  <option key={i.code_reference} value={i.code_reference}>{i.code_reference} · {i.name} · {pesos(i.price)}</option>
                ))}
              </select>
              <label htmlFor="campo-3">Tipo de glosa</label>
              <select disabled={ocupado !== null} id="campo-3" value={tipo} onChange={(e: any) => setTipo(e.target.value)}>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label htmlFor="campo-4">Valor glosado</label>
              <input disabled={ocupado !== null} id="campo-4" type="number" min="0.01" step="0.01" max={Number(factura?.total ?? 0)} value={valor} onChange={(e: any) => setValor(e.target.value)} />
              {valor && !valorValido && <Aviso tipo="error">Ingresa un valor mayor a cero que no supere {pesos(factura?.total)}. El backend verificará el saldo disponible para la nota crédito.</Aviso>}
              <label htmlFor="campo-5">Motivo</label>
              <input disabled={ocupado !== null} id="campo-5" type="text" value={motivo} onChange={(e: any) => setMotivo(e.target.value)} />
              <div className="acciones">
                <button className="btn" onClick={registrar} disabled={ocupado !== null || cargando || !facturaId || !valorValido || !motivo.trim()}>{ocupado === 'nueva' ? 'Registrando…' : 'Registrar glosa'}</button>
              </div>
            </>
          )}
        </div>

        <div className="tarjeta">
          <h2>Glosas</h2>
          <Busqueda valor={busqueda} cambiar={setBusqueda} placeholder="Buscar por factura, EPS o motivo…" />
          <div className="acciones" style={{ marginBottom: 16 }}><button className="btn sec chico" disabled={cargando || ocupado !== null} onClick={() => { void cargar().catch(() => {}) }}>Actualizar glosas</button></div>
          {cargando ? <Cargando /> : filtradas.length === 0 ? (
            <p className="vacio">{errorCarga ? 'No se pudo consultar la lista de glosas.' : glosas.length ? 'No hay glosas que coincidan con la búsqueda.' : 'Sin glosas registradas.'}</p>
          ) : (
            <table>
              <thead>
                <tr><th>Factura</th><th>Glosa</th><th className="num">Valor</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {filtradas.map((g) => (
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

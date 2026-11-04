'use client'
import { useEffect, useMemo, useState } from 'react'
import { calcularRecaudo } from '@/lib/copago'
import type { Admision, AdmisionResumen, Catalogos } from '../components/tipos'
import { api, fechaHora, pesos } from '../components/api'
import { Aviso, Busqueda, Cargando, Descargas, Estado, Hallazgos, LineaEstados } from '../components/ui'

const SIGUE_CONSULTANDO = ['cobro_pendiente', 'pagada', 'cobro_vencido']

function cuentaRegresiva(hasta: string | null | undefined, ahora: number) {
  if (!hasta || !Number.isFinite(new Date(hasta).getTime())) return null
  const s = Math.max(0, Math.floor((new Date(hasta).getTime() - ahora) / 1000))
  return { texto: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, vencido: s === 0 }
}

export default function Caja() {
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [limite, setLimite] = useState(12)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [cargandoLista, setCargandoLista] = useState(true)
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null)
  const [cat, setCat] = useState<Catalogos | null>(null)
  const [pacienteId, setPacienteId] = useState<number | null>(null)
  const [contratoId, setContratoId] = useState<number | null>(null)
  const [concepto, setConcepto] = useState('CUO')
  const [sel, setSel] = useState<string[]>(['890201'])
  const [admisionId, setAdmisionId] = useState<number | null>(null)
  const [adm, setAdm] = useState<Admision | null>(null)
  const [recientes, setRecientes] = useState<AdmisionResumen[]>([])
  const [error, setError] = useState<{ mensaje: string; hallazgos?: any[] } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [ahora, setAhora] = useState(Date.now())

  function cargarCatalogos() {
    setError(null)
    api<Catalogos>('/api/catalogos').then((c) => {
      setCat(c)
      setPacienteId(c.pacientes[0]?.id ?? null)
      setContratoId(c.contratos[0]?.id ?? null)
    }).catch((e) => setError({ mensaje: e.message }))
  }
  useEffect(() => {
    cargarCatalogos()
    cargarRecientes()
  }, [])

  // Reloj para la cuenta regresiva del QR
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Consulta el estado cada 3 s mientras el cobro esté en curso (el backend también reconcilia con Factus Pay)
  useEffect(() => {
    if (!admisionId) return
    let vivo = true
    let consultando = false
    setErrorConsulta(null)
    const cargar = async () => {
      if (consultando) return
      consultando = true
      try {
        const d = await api<Admision>(`/api/admisiones/${admisionId}`)
        if (vivo) { setAdm(d); setErrorConsulta(null) }
      } catch (e) { if (vivo) setErrorConsulta(e instanceof Error ? e.message : 'No se pudo consultar el estado') }
      finally { consultando = false }
    }
    void cargar()
    const t = setInterval(() => {
      if (!adm || SIGUE_CONSULTANDO.includes(adm.estado) || adm.facturas?.some((f) => f.estado === 'enviando')) void cargar()
    }, 3000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [admisionId, adm?.estado, adm?.facturas?.map(f => f.estado).join(',')])

  // La lista de recientes se refresca cuando cambia el estado de la admisión abierta
  useEffect(() => {
    if (adm?.estado) cargarRecientes()
  }, [adm?.estado])

  function cargarRecientes() {
    setCargandoLista(true)
    api<AdmisionResumen[]>('/api/admisiones').then(setRecientes).catch((e) => setError({ mensaje: e.message })).finally(() => setCargandoLista(false))
  }

  const paciente = cat?.pacientes.find((p) => p.id === pacienteId)
  const contrato = cat?.contratos.find((c) => c.id === contratoId)
  const disponibles = useMemo(
    () => (cat && contrato ? cat.servicios.filter((s) => contrato.tarifas?.[s.codigo] !== undefined) : []),
    [cat, contrato],
  )
  const seleccionados = sel.filter(c => contrato?.tarifas?.[c] !== undefined)
  const total = seleccionados.reduce((s, c) => s + Number(contrato?.tarifas?.[c] ?? 0) * (cantidades[c] ?? 1), 0)
  const cantidadesValidas = seleccionados.every(c => Number.isFinite(cantidades[c] ?? 1) && (cantidades[c] ?? 1) > 0)
  const filtrados = recientes.filter(r => (!filtroEstado || r.estado === filtroEstado) && `${r.codigo} ${r.paciente} ${r.eps}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))
  const estimado = paciente && contrato ? calcularRecaudo(contrato.cuotas, concepto, paciente.categoria, total) : 0

  async function crear() {
    if (!pacienteId || !contratoId || !seleccionados.length || !cantidadesValidas) { setError({ mensaje: 'Selecciona paciente, contrato y al menos un servicio con cantidad mayor a cero.' }); return }
    setOcupado(true)
    setError(null)
    try {
      const r = await api('/api/admisiones', {
        json: { paciente_id: pacienteId, contrato_id: contratoId, concepto, servicios: seleccionados.map((codigo) => ({ codigo, cantidad: cantidades[codigo] ?? 1 })) },
      })
      setAdm(null)
      setAdmisionId(r.id)
      cargarRecientes()
    } catch (e: any) {
      setError({ mensaje: e.message, hallazgos: e.datos?.hallazgos })
    } finally {
      setOcupado(false)
    }
  }

  async function cobrar() {
    if (!admisionId) return
    setOcupado(true)
    setError(null)
    try {
      await api(`/api/admisiones/${admisionId}/cobro`, { metodo: 'POST' })
      setAdm(await api<Admision>(`/api/admisiones/${admisionId}`))
      cargarRecientes()
    } catch (e: any) {
      setError({ mensaje: e.message, hallazgos: e.datos?.hallazgos })
    } finally {
      setOcupado(false)
    }
  }

  async function simular(resultado: 'paid' | 'rejected') {
    const r = adm?.recaudos?.at(-1)
    if (!r) return
    setOcupado(true)
    setError(null)
    try {
      await api('/api/dev/simular-pago', { json: { reference_code: r.reference_code, resultado } })
      setAdm(await api<Admision>(`/api/admisiones/${admisionId}`))
    } catch (e: any) {
      setError({ mensaje: e.message })
    } finally { setOcupado(false) }
  }

  const recaudo = adm?.recaudos?.at(-1)
  const facturaCopago = adm?.facturas?.find((f) => f.tipo === 'SS-Recaudo' && (!recaudo || f.reference_code === `FV-${recaudo.reference_code}`)) ?? adm?.facturas?.find((f) => f.tipo === 'SS-Recaudo')
  const cuenta = cuentaRegresiva(recaudo?.qr_expira, ahora)
  const esMock = String(recaudo?.breb_key ?? '').startsWith('@FCMOCK')
  const puedeCobrar = adm && ['creada', 'cobro_vencido', 'cobro_fallido'].includes(adm.estado)
  const qrVigente = adm?.estado === 'cobro_pendiente' && recaudo?.qr && !cuenta?.vencido

  return (
    <>
      <h1>Caja · admisión y cobro del copago</h1>
      <p className="sub">Registra la atención, cobra con QR y consulta la factura del copago en un solo lugar.</p>

      {error && (
        <Aviso tipo="error">
          {error.mensaje}
          <Hallazgos lista={error.hallazgos} /><button className="btn sec chico" onClick={() => { cargarCatalogos(); cargarRecientes() }}>Reintentar carga</button>
        </Aviso>
      )}

      <div className="rejilla dos">
        <div className="tarjeta">
          <h2>1. Admisión</h2>
          {!cat && error ? <p className="vacio">No se pudieron cargar los catálogos. Reintenta la carga para registrar una admisión.</p> : !cat ? (
            <p className="mudo">Cargando catálogos…</p>
          ) : (
            <>
              <label htmlFor="campo-1">Paciente</label>
              <select id="campo-1" value={pacienteId ?? ''} onChange={(e: any) => setPacienteId(Number(e.target.value))}>
                {cat.pacientes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombres} {p.apellidos} · {p.tipo_doc_salud} {p.numero_doc} · cat. {p.categoria}
                  </option>
                ))}
              </select>
              <label htmlFor="campo-2">EPS y contrato</label>
              <select id="campo-2" value={contratoId ?? ''} onChange={(e: any) => setContratoId(Number(e.target.value))}>
                {cat.contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.eps} · {c.numero}{c.esquema_recaudo === 1 ? ' · recaudo para terceros' : ''}
                  </option>
                ))}
              </select>
              <label htmlFor="campo-3">Concepto del recaudo</label>
              <select id="campo-3" value={concepto} onChange={(e: any) => setConcepto(e.target.value)}>
                <option value="CUO">Cuota moderadora (CUO)</option>
                <option value="COP">Copago (COP)</option>
                <option value="PAC">Pago compartido plan voluntario (PAC)</option>
              </select>
              <label>Servicios</label>
              {disponibles.length === 0 && <Aviso tipo="alerta">Este contrato no tiene servicios disponibles.</Aviso>}
              <div className="servicios" role="group" aria-label="Servicios de la atención">
                {disponibles.map((s) => {
                  const marcado = sel.includes(s.codigo)
                  return (
                    <div key={s.codigo} className={`servicio ${marcado ? 'sel' : ''}`} style={{ margin: 0, fontWeight: 400, color: 'inherit' }}>
                      <label className="check" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => setSel(marcado ? sel.filter((x) => x !== s.codigo) : [...sel, s.codigo])}
                        />
                        <span><b>{s.codigo}</b> {s.nombre}</span>
                      </label>
                      <span className="num">{pesos(contrato?.tarifas[s.codigo])}</span>
                      {marcado && <input className="cantidad" aria-label={`Cantidad de ${s.nombre}`} type="number" min="0.01" step="0.01" value={cantidades[s.codigo] ?? 1} onChange={e => setCantidades({ ...cantidades, [s.codigo]: Number(e.target.value) })} />}
                    </div>
                  )
                })}
              </div>
              <div className="totales">
                <span>Servicios {pesos(total)}</span>
                <b>A cobrar en caja: {pesos(estimado)}</b>
              </div>
              {estimado > 0 && estimado < 1000 && <Aviso tipo="alerta">Menos de $1.000: Factus Pay no lo cobra por QR (regla V01).</Aviso>}
              {!cantidadesValidas && <Aviso tipo="error">Cada servicio seleccionado debe tener una cantidad mayor a cero.</Aviso>}
              <div className="acciones">
                <button className="btn" onClick={crear} disabled={ocupado || !seleccionados.length || !pacienteId || !contratoId || !cantidadesValidas}>Registrar admisión</button>
              </div>
            </>
          )}
        </div>

        <div className="tarjeta">
          <h2>2. Cobro con QR</h2>
          {errorConsulta && <Aviso tipo="error">No se pudo actualizar el cobro: {errorConsulta}. Se reintentará automáticamente.</Aviso>}
          {!adm ? (
            <p className="vacio">Registra una admisión o elige una reciente.</p>
          ) : (
            <>
              <p>
                <b>{adm.codigo}</b> · {adm.nombres} {adm.apellidos} · <Estado valor={adm.estado} />
              </p>
              <LineaEstados estado={adm.estado} />
              {adm.estado === 'cobro_pendiente' && cuenta?.vencido && <Aviso tipo="alerta">El QR venció. Genera uno nuevo para continuar con el cobro.</Aviso>}
              {adm.estado === 'cobro_fallido' && <Aviso tipo="error">El pago no se completó. Puedes generar un nuevo cobro.</Aviso>}
              {adm.nota_estado && <Aviso tipo={adm.estado === 'requiere_revision' || adm.estado === 'cobro_fallido' ? 'error' : 'alerta'}>{adm.nota_estado}</Aviso>}

              {qrVigente ? (
                <div className="qr" style={{ marginTop: 14 }}>
                  <img src={recaudo.qr ?? undefined} alt="QR Bre-B de Factus Pay" />
                  <div>
                    <div className="mudo">Valor a pagar</div>
                    <div className="cifra">{pesos(recaudo.monto)}</div>
                    <p>Llave Bre-B <span className="llave">{recaudo.breb_key}</span></p>
                    <p className="mudo">Referencia {recaudo.reference_code}</p>
                    <p>Vence en <span className="cuenta">{cuenta?.texto}</span></p>
                    <p className="mudo">Esperando el pago… (webhook o consulta cada 3 s)</p>
                    {esMock && (
                      <div className="acciones">
                        <button className="btn chico" disabled={ocupado} onClick={() => simular('paid')}>Simular pago exitoso</button>
                        <button className="btn chico peligro" disabled={ocupado} onClick={() => simular('rejected')}>Simular pago fallido</button>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {puedeCobrar || (adm.estado === 'cobro_pendiente' && cuenta?.vencido) ? (
                <div className="acciones">
                  <button className="btn" onClick={cobrar} disabled={ocupado}>
                    {adm.estado === 'creada' ? `Generar QR por ${pesos(adm.monto_recaudo)}` : adm.estado === 'cobro_fallido' ? 'Cobrar de nuevo' : 'Regenerar QR'}
                  </button>
                </div>
              ) : null}

              {recaudo?.estado === 'paid' && (
                <Aviso tipo="ok">
                  Pago confirmado por {recaudo.origen_confirmacion ?? 'Factus Pay'} · {fechaHora(recaudo.pagado_en)}
                </Aviso>
              )}

              {facturaCopago && (
                <div className="tarjeta" style={{ marginTop: 14 }}>
                  <h3>Factura SS-Recaudo <Estado valor={facturaCopago.estado} /></h3>
                  {facturaCopago.numero ? (
                    <>
                      <p>
                        <b>{facturaCopago.numero}</b> · {pesos(facturaCopago.total)}
                      </p>
                      <p className="mudo" style={{ wordBreak: 'break-all' }}>CUFE {facturaCopago.cufe}</p>
                      <div className="acciones">
                        <Descargas base="facturas" id={facturaCopago.id} />
                        {facturaCopago.public_url && (
                          <a className="btn sec chico" href={facturaCopago.public_url} target="_blank" rel="noreferrer">Ver en Factus</a>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="mudo">{facturaCopago.error_mensaje ?? 'Emitiendo en Factus…'}</p>
                  )}
                  <Hallazgos lista={facturaCopago.errores_validacion} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="tarjeta" style={{ marginTop: 18 }}>
        <h2>Admisiones recientes</h2>
        <div className="filtros"><Busqueda valor={busqueda} cambiar={v => { setBusqueda(v); setLimite(12) }} /><label>Estado<select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setLimite(12) }}><option value="">Todos los estados</option>{Array.from(new Set(recientes.map(r => r.estado))).map(estado => <option key={estado} value={estado}>{estado.replace(/_/g, ' ')}</option>)}</select></label><button className="btn sec" onClick={cargarRecientes} disabled={cargandoLista}>Actualizar</button></div>
        {cargandoLista ? <Cargando /> : filtrados.length === 0 ? (
          <p className="vacio">Aún no hay admisiones.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Código</th><th>Paciente</th><th>EPS</th><th className="num">Cobro</th><th>Estado</th><th>Creada</th></tr>
            </thead>
            <tbody>
              {filtrados.slice(0, limite).map((r) => (
                <tr key={r.id} className={`clic ${r.id === admisionId ? 'activo' : ''}`} onClick={() => { if (!ocupado && r.id !== admisionId) { setAdm(null); setAdmisionId(r.id) } }}>
                  <td className="nowrap"><button className="fila-boton" disabled={ocupado}>{r.codigo}</button></td><td>{r.paciente}</td><td>{r.eps}</td>
                  <td className="num">{pesos(r.monto_recaudo)}</td><td><Estado valor={r.estado} /></td><td>{fechaHora(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="nota">Mostrando {Math.min(limite, filtrados.length)} de {filtrados.length} admisiones cargadas. El servidor devuelve hasta 50 recientes.</p>
        {filtrados.length > limite && <button className="btn sec" onClick={() => setLimite(limite + 12)}>Ver más admisiones</button>}
      </div>
    </>
  )
}

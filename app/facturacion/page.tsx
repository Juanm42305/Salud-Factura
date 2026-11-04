'use client'
import { useEffect, useState } from 'react'
import { CAUSALES_SIN_CONTRATO, COBERTURAS, METODOS_PAGO_SALUD } from '@/lib/validation/tablas'
import type { Admision, AdmisionResumen } from '../components/tipos'
import { api, pesos } from '../components/api'
import { Aviso, Busqueda, Cargando, Descargas, Estado, Hallazgos, LineaEstados, type HallazgoUI } from '../components/ui'

const ESTADOS = 'copago_facturado,atencion_cerrada,requiere_revision,facturada_eps,glosada'

export default function Facturacion() {
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [cargandoAdm, setCargandoAdm] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [lista, setLista] = useState<AdmisionResumen[]>([])
  const [id, setId] = useState<number | null>(null)
  const [adm, setAdm] = useState<Admision | null>(null)
  const [sinContrato, setSinContrato] = useState(false)
  const [causal, setCausal] = useState('')
  const [poliza, setPoliza] = useState('')
  const [revision, setRevision] = useState<{ ok: boolean; hallazgos: HallazgoUI[]; payload: any } | null>(null)
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'bloqueada' | 'error'; mensaje: string; hallazgos?: HallazgoUI[] } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargarLista = () => { setCargando(true); setErrorCarga(null); return api<AdmisionResumen[]>(`/api/admisiones?estado=${ESTADOS}`).then(setLista).catch(e => setErrorCarga(e.message)).finally(() => setCargando(false)) }
  const cargarAdm = (x: number) => api<Admision>(`/api/admisiones/${x}`).then(setAdm)

  useEffect(() => {
    void cargarLista()
  }, [])
  useEffect(() => {
    setRevision(null)
    setResultado(null)
    setAdm(null)
    setSinContrato(false); setCausal(''); setPoliza('')
    let activo = true
    if (id) { setCargandoAdm(true); api<Admision>(`/api/admisiones/${id}`).then(d => { if (activo) setAdm(d) }).catch(e => { if (activo) setErrorCarga(e.message) }).finally(() => { if (activo) setCargandoAdm(false) }) }
    return () => { activo = false }
  }, [id])

  useEffect(() => { setRevision(null) }, [sinContrato, causal, poliza])

  const opciones = () => ({
    sinContrato,
    ...(causal ? { withoutContractCode: causal } : {}),
    ...(poliza ? { policyNumber: poliza } : {}),
  })

  async function validar() {
    if (!id || ocupado) return
    setOcupado(true)
    setResultado(null)
    try {
      setRevision(await api('/api/validaciones', { json: { tipo: 'ssCufe', admision_id: id, opciones: opciones() } }))
    } catch (e: any) {
      setResultado({ tipo: 'error', mensaje: e.message })
    } finally {
      setOcupado(false)
    }
  }

  async function emitir() {
    if (!id || ocupado) return
    setOcupado(true)
    setResultado(null)
    try {
      const r = await api(`/api/atenciones/${id}/factura-eps`, { json: opciones() })
      setResultado({
        tipo: 'ok',
        mensaje: r.ya_existia ? `La atención ya tenía la factura ${r.factura?.numero}` : `Factura ${r.factura?.numero} validada por la DIAN${r.via === 'reintento_409' ? ' (se resolvió un 409 pendiente)' : ''}`,
        hallazgos: r.advertencias,
      })
      setRevision(null)
      await cargarAdm(id).catch(e => setErrorCarga(e.message))
      void cargarLista()
    } catch (e: any) {
      if (e.status === 422 && e.datos?.hallazgos) {
        setResultado({ tipo: 'bloqueada', mensaje: 'El validador bloqueó la factura antes de enviarla a la DIAN', hallazgos: e.datos.hallazgos })
      } else {
        setResultado({ tipo: 'error', mensaje: e.message })
      }
      await cargarAdm(id).catch(e => setErrorCarga(e.message))
    } finally {
      setOcupado(false)
    }
  }

  const facturaEps = adm?.facturas?.find((f) => f.tipo === 'SS-CUFE')
  const copagos = adm?.facturas?.filter((f) => f.tipo === 'SS-Recaudo' && f.estado === 'validada') ?? []
  const totalCopagos = copagos.reduce((s, f) => s + Number(f.total), 0)
  const filtrados = lista.filter(a => `${a.codigo} ${a.paciente} ${a.eps}`.toLowerCase().includes(busqueda.toLowerCase()))
  const yaFacturada = facturaEps?.estado === 'validada'

  return (
    <>
      <h1>Facturación a la EPS (SS-CUFE)</h1>
      <p className="sub">Revisa los servicios, descuenta los copagos facturados y valida la cuenta antes de emitir la factura SS-CUFE.</p>

      {errorCarga && <Aviso tipo="error">{errorCarga}<div className="acciones"><button className="btn sec chico" onClick={() => { void cargarLista(); if (id) cargarAdm(id).catch(e => setErrorCarga(e.message)) }}>Reintentar</button></div></Aviso>}
      <div className="rejilla dos">
        <div className="tarjeta">
          <h2>Atenciones con copago facturado</h2>
          <Busqueda valor={busqueda} cambiar={setBusqueda} />
          <div className="acciones" style={{ marginBottom: 16 }}><button className="btn sec chico" disabled={ocupado || cargando || cargandoAdm} onClick={async () => { await cargarLista(); if (id) await cargarAdm(id).catch(e => setErrorCarga(e.message)) }}>Actualizar atenciones</button></div>
          {cargando ? <Cargando /> : filtrados.length === 0 ? (
            <p className="vacio">{errorCarga ? 'No se pudo consultar la lista de atenciones.' : lista.length ? 'No hay atenciones que coincidan con la búsqueda.' : 'No hay atenciones listas. Cobra un copago en Caja primero.'}</p>
          ) : (
            <table>
              <thead>
                <tr><th>Atención</th><th>Paciente</th><th className="num">Servicios</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {filtrados.map((a) => (
                  <tr key={a.id} className={`clic ${a.id === id ? 'activo' : ''}`} onClick={() => !ocupado && setId(a.id)}>
                    <td className="nowrap"><button className="fila-boton" disabled={ocupado} onClick={() => setId(a.id)}>{a.codigo?.replace('ADM-', 'ATN-')}</button></td>
                    <td>{a.paciente}<div className="mudo">{a.eps}</div></td>
                    <td className="num">{pesos(a.total_servicios)}</td>
                    <td><Estado valor={a.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="tarjeta">
          {cargandoAdm ? <Cargando texto="Consultando la atención…" /> : !adm ? (
            <p className="vacio">Elige una atención.</p>
          ) : (
            <>
              <h2>{adm.atencion_codigo} · {adm.nombres} {adm.apellidos}</h2>
              <LineaEstados estado={adm.estado} />
              <p className="mudo">
                {adm.eps} · contrato {adm.contrato_numero} · {METODOS_PAGO_SALUD[adm.modalidad_pago]} · {COBERTURAS[adm.cobertura]}
              </p>
              <table>
                <tbody>
                  {adm.servicios.map((s) => (
                    <tr key={s.codigo}>
                      <td><b>{s.codigo}</b> {s.nombre}</td>
                      <td className="num">{Number(s.cantidad)} × {pesos(s.tarifa)}</td>
                    </tr>
                  ))}
                  <tr><td>Total servicios</td><td className="num"><b>{pesos(adm.total_servicios)}</b></td></tr>
                  {copagos.map((f) => (
                    <tr key={f.id}><td className="mudo">Copago facturado {f.numero} ({f.reference_code})</td><td className="num">− {pesos(f.total)}</td></tr>
                  ))}
                  <tr><td>A cargo de la EPS</td><td className="num"><b>{pesos(adm.total_servicios - totalCopagos)}</b></td></tr>
                </tbody>
              </table>

              {!yaFacturada && (
                <>
                  <label className="check" style={{ marginTop: 16 }}>
                    <input disabled={ocupado} type="checkbox" checked={sinContrato} onChange={(e: any) => setSinContrato(e.target.checked)} />
                    Facturar sin número de contrato
                  </label>
                  {sinContrato && (
                    <>
                      <label htmlFor="campo-1">Causal de factura sin contrato</label>
                      <select disabled={ocupado} id="campo-1" value={causal} onChange={(e: any) => setCausal(e.target.value)}>
                        <option value="">(sin causal)</option>
                        {Object.entries(CAUSALES_SIN_CONTRATO).map(([k, v]) => (
                          <option key={k} value={k}>{k} · {v}</option>
                        ))}
                      </select>
                    </>
                  )}
                  {['04', '05'].includes(adm.cobertura) && (
                    <>
                      <label htmlFor="campo-2">Número de póliza (SOAT / ARL)</label>
                      <input disabled={ocupado} id="campo-2" type="text" value={poliza} onChange={(e: any) => setPoliza(e.target.value)} />
                    </>
                  )}
                  <div className="acciones">
                    <button className="btn sec" onClick={validar} disabled={ocupado}>Validar antes de enviar</button>
                    <button className="btn" onClick={emitir} disabled={ocupado || revision?.ok === false || facturaEps?.estado === 'enviando'}>{ocupado ? 'Enviando a Factus…' : 'Emitir factura a la EPS'}</button>
                  </div>
                </>
              )}

              {revision && (
                <>
                  <Aviso tipo={revision.ok ? 'ok' : 'error'}>
                    {revision.ok ? 'Sin errores: la factura puede enviarse a la DIAN.' : 'Esta factura sería rechazada o glosada. Corrige antes de enviar:'}
                  </Aviso>
                  <Hallazgos lista={revision.hallazgos} />
                  <details>
                    <summary>Ver payload que se enviaría a Factus</summary>
                    <pre>{JSON.stringify(revision.payload, null, 2)}</pre>
                  </details>
                </>
              )}

              {resultado && (
                <>
                  <Aviso tipo={resultado.tipo === 'ok' ? 'ok' : 'error'}>{resultado.mensaje}</Aviso>
                  <Hallazgos lista={resultado.hallazgos} />
                </>
              )}

              {facturaEps && (
                <div className="tarjeta" style={{ marginTop: 14 }}>
                  <h3>Factura SS-CUFE <Estado valor={facturaEps.estado} /></h3>
                  <p className="mudo">{facturaEps.reference_code}</p>
                  {facturaEps.numero && (
                    <>
                      <p><b>{facturaEps.numero}</b> · neto {pesos(facturaEps.total_neto)} de {pesos(facturaEps.total)}</p>
                      <p className="mudo" style={{ wordBreak: 'break-all' }}>CUFE {facturaEps.cufe}</p>
                      <div className="acciones"><Descargas base="facturas" id={facturaEps.id} /></div>
                    </>
                  )}
                  {facturaEps.error_mensaje && <Aviso tipo="error">{facturaEps.error_mensaje}</Aviso>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { CAUSALES_SIN_CONTRATO, COBERTURAS, METODOS_PAGO_SALUD } from '@/lib/validation/tablas'
import { api, pesos } from '../components/api'
import { Aviso, Descargas, Estado, Hallazgos, LineaEstados, type HallazgoUI } from '../components/ui'

const ESTADOS = 'copago_facturado,atencion_cerrada,requiere_revision,facturada_eps,glosada'

export default function Facturacion() {
  const [lista, setLista] = useState<any[]>([])
  const [id, setId] = useState<number | null>(null)
  const [adm, setAdm] = useState<any>(null)
  const [sinContrato, setSinContrato] = useState(false)
  const [causal, setCausal] = useState('')
  const [poliza, setPoliza] = useState('')
  const [revision, setRevision] = useState<{ ok: boolean; hallazgos: HallazgoUI[]; payload: any } | null>(null)
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'bloqueada' | 'error'; mensaje: string; hallazgos?: HallazgoUI[] } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargarLista = () => api(`/api/admisiones?estado=${ESTADOS}`).then(setLista).catch(() => {})
  const cargarAdm = (x: number) => api(`/api/admisiones/${x}`).then(setAdm)

  useEffect(() => {
    void cargarLista()
  }, [])
  useEffect(() => {
    setRevision(null)
    setResultado(null)
    if (id) cargarAdm(id).catch(() => setAdm(null))
  }, [id])

  const opciones = () => ({
    sinContrato,
    ...(causal ? { withoutContractCode: causal } : {}),
    ...(poliza ? { policyNumber: poliza } : {}),
  })

  async function validar() {
    if (!id) return
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
    if (!id) return
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
      await cargarAdm(id)
      void cargarLista()
    } catch (e: any) {
      if (e.status === 422 && e.datos?.hallazgos) {
        setResultado({ tipo: 'bloqueada', mensaje: 'El validador bloqueó la factura antes de enviarla a la DIAN', hallazgos: e.datos.hallazgos })
      } else {
        setResultado({ tipo: 'error', mensaje: e.message })
      }
      setOcupado(false)
      await cargarAdm(id).catch(() => {})
    } finally {
      setOcupado(false)
    }
  }

  const facturaEps = adm?.facturas?.find((f: any) => f.tipo === 'SS-CUFE')
  const copagos = adm?.facturas?.filter((f: any) => f.tipo === 'SS-Recaudo' && f.estado === 'validada') ?? []
  const totalCopagos = copagos.reduce((s: number, f: any) => s + Number(f.total), 0)
  const yaFacturada = facturaEps?.estado === 'validada'

  return (
    <>
      <h1>Facturación a la EPS (SS-CUFE)</h1>
      <p className="sub">Cierra la atención y factura a la EPS el total de servicios, descontando los copagos ya facturados (prepayment_details).</p>

      <div className="rejilla dos">
        <div className="tarjeta">
          <h2>Atenciones con copago facturado</h2>
          {lista.length === 0 ? (
            <p className="vacio">No hay atenciones listas. Cobra un copago en Caja primero.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Atención</th><th>Paciente</th><th className="num">Servicios</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.id} className={`clic ${a.id === id ? 'activo' : ''}`} onClick={() => setId(a.id)}>
                    <td className="nowrap">{a.codigo?.replace('ADM-', 'ATN-')}</td>
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
          {!adm ? (
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
                  {adm.servicios.map((s: any) => (
                    <tr key={s.codigo}>
                      <td><b>{s.codigo}</b> {s.nombre}</td>
                      <td className="num">{Number(s.cantidad)} × {pesos(s.tarifa)}</td>
                    </tr>
                  ))}
                  <tr><td>Total servicios</td><td className="num"><b>{pesos(adm.total_servicios)}</b></td></tr>
                  {copagos.map((f: any) => (
                    <tr key={f.id}><td className="mudo">Copago facturado {f.numero} ({f.reference_code})</td><td className="num">− {pesos(f.total)}</td></tr>
                  ))}
                  <tr><td>A cargo de la EPS</td><td className="num"><b>{pesos(adm.total_servicios - totalCopagos)}</b></td></tr>
                </tbody>
              </table>

              {!yaFacturada && (
                <>
                  <label className="check" style={{ marginTop: 16 }}>
                    <input type="checkbox" checked={sinContrato} onChange={(e: any) => setSinContrato(e.target.checked)} />
                    Facturar sin número de contrato
                  </label>
                  {sinContrato && (
                    <>
                      <label>Causal de factura sin contrato</label>
                      <select value={causal} onChange={(e: any) => setCausal(e.target.value)}>
                        <option value="">(sin causal)</option>
                        {Object.entries(CAUSALES_SIN_CONTRATO).map(([k, v]) => (
                          <option key={k} value={k}>{k} · {v}</option>
                        ))}
                      </select>
                    </>
                  )}
                  {['04', '05'].includes(adm.cobertura) && (
                    <>
                      <label>Número de póliza (SOAT / ARL)</label>
                      <input type="text" value={poliza} onChange={(e: any) => setPoliza(e.target.value)} />
                    </>
                  )}
                  <div className="acciones">
                    <button className="btn sec" onClick={validar} disabled={ocupado}>Validar antes de enviar</button>
                    <button className="btn" onClick={emitir} disabled={ocupado}>{ocupado ? 'Enviando a Factus…' : 'Emitir factura a la EPS'}</button>
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

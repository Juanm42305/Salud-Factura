'use client'
import { useEffect, useMemo, useState } from 'react'
import { calcularRecaudo } from '@/lib/copago'
import { api, fechaHora, pesos } from '../components/api'
import { Aviso, Descargas, Estado, Hallazgos, LineaEstados } from '../components/ui'

const SIGUE_CONSULTANDO = ['cobro_pendiente', 'pagada', 'cobro_vencido']

function cuentaRegresiva(hasta: string | null | undefined, ahora: number) {
  if (!hasta) return null
  const s = Math.max(0, Math.floor((new Date(hasta).getTime() - ahora) / 1000))
  return { texto: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, vencido: s === 0 }
}

export default function Caja() {
  const [cat, setCat] = useState<any>(null)
  const [pacienteId, setPacienteId] = useState<number | null>(null)
  const [contratoId, setContratoId] = useState<number | null>(null)
  const [concepto, setConcepto] = useState('CUO')
  const [sel, setSel] = useState<string[]>(['890201'])
  const [admisionId, setAdmisionId] = useState<number | null>(null)
  const [adm, setAdm] = useState<any>(null)
  const [recientes, setRecientes] = useState<any[]>([])
  const [error, setError] = useState<{ mensaje: string; hallazgos?: any[] } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [ahora, setAhora] = useState(Date.now())

  useEffect(() => {
    api('/api/catalogos').then((c) => {
      setCat(c)
      setPacienteId(c.pacientes[0]?.id ?? null)
      setContratoId(c.contratos[0]?.id ?? null)
    }).catch((e) => setError({ mensaje: e.message }))
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
    const cargar = () => api(`/api/admisiones/${admisionId}`).then((d) => vivo && setAdm(d)).catch(() => {})
    void cargar()
    const t = setInterval(() => {
      if (!adm || SIGUE_CONSULTANDO.includes(adm.estado) || adm.facturas?.some((f: any) => f.estado === 'enviando')) void cargar()
    }, 3000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [admisionId, adm?.estado, adm?.facturas?.length])

  // La lista de recientes se refresca cuando cambia el estado de la admisión abierta
  useEffect(() => {
    if (adm?.estado) cargarRecientes()
  }, [adm?.estado])

  function cargarRecientes() {
    api('/api/admisiones').then(setRecientes).catch(() => {})
  }

  const paciente = cat?.pacientes.find((p: any) => p.id === pacienteId)
  const contrato = cat?.contratos.find((c: any) => c.id === contratoId)
  const disponibles = useMemo(
    () => (cat && contrato ? cat.servicios.filter((s: any) => contrato.tarifas?.[s.codigo] !== undefined) : []),
    [cat, contrato],
  )
  const total = sel.reduce((s, c) => s + Number(contrato?.tarifas?.[c] ?? 0), 0)
  const estimado = paciente && contrato ? calcularRecaudo(contrato.cuotas, concepto, paciente.categoria, total) : 0

  async function crear() {
    setOcupado(true)
    setError(null)
    try {
      const r = await api('/api/admisiones', {
        json: { paciente_id: pacienteId, contrato_id: contratoId, concepto, servicios: sel.filter((c) => contrato?.tarifas?.[c] !== undefined).map((codigo) => ({ codigo })) },
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
      setAdm(await api(`/api/admisiones/${admisionId}`))
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
    try {
      await api('/api/dev/simular-pago', { json: { reference_code: r.reference_code, resultado } })
      setAdm(await api(`/api/admisiones/${admisionId}`))
    } catch (e: any) {
      setError({ mensaje: e.message })
    }
  }

  const recaudo = adm?.recaudos?.at(-1)
  const facturaCopago = adm?.facturas?.find((f: any) => f.tipo === 'SS-Recaudo' && (!recaudo || f.reference_code === `FV-${recaudo.reference_code}`)) ?? adm?.facturas?.find((f: any) => f.tipo === 'SS-Recaudo')
  const cuenta = cuentaRegresiva(recaudo?.qr_expira, ahora)
  const esMock = String(recaudo?.breb_key ?? '').startsWith('@FCMOCK')
  const puedeCobrar = adm && ['creada', 'cobro_vencido', 'cobro_fallido'].includes(adm.estado)
  const qrVigente = adm?.estado === 'cobro_pendiente' && recaudo?.qr && !cuenta?.vencido

  return (
    <>
      <h1>Caja · admisión y cobro del copago</h1>
      <p className="sub">El cobro sale de Factus Pay (QR Bre-B). Cuando el pago se confirma, la factura SS-Recaudo se emite sola.</p>

      {error && (
        <Aviso tipo="error">
          {error.mensaje}
          <Hallazgos lista={error.hallazgos} />
        </Aviso>
      )}

      <div className="rejilla dos">
        <div className="tarjeta">
          <h2>1. Admisión</h2>
          {!cat ? (
            <p className="mudo">Cargando catálogos…</p>
          ) : (
            <>
              <label>Paciente</label>
              <select value={pacienteId ?? ''} onChange={(e: any) => setPacienteId(Number(e.target.value))}>
                {cat.pacientes.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.nombres} {p.apellidos} · {p.tipo_doc_salud} {p.numero_doc} · cat. {p.categoria}
                  </option>
                ))}
              </select>
              <label>EPS y contrato</label>
              <select value={contratoId ?? ''} onChange={(e: any) => setContratoId(Number(e.target.value))}>
                {cat.contratos.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.eps} · {c.numero}{c.esquema_recaudo === 1 ? ' · recaudo para terceros' : ''}
                  </option>
                ))}
              </select>
              <label>Concepto del recaudo</label>
              <select value={concepto} onChange={(e: any) => setConcepto(e.target.value)}>
                <option value="CUO">Cuota moderadora (CUO)</option>
                <option value="COP">Copago (COP)</option>
                <option value="PAC">Pago compartido plan voluntario (PAC)</option>
              </select>
              <label>Servicios</label>
              <div className="servicios">
                {disponibles.map((s: any) => {
                  const marcado = sel.includes(s.codigo)
                  return (
                    <label key={s.codigo} className={`servicio ${marcado ? 'sel' : ''}`} style={{ margin: 0, fontWeight: 400, color: 'inherit' }}>
                      <span className="check">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => setSel(marcado ? sel.filter((x) => x !== s.codigo) : [...sel, s.codigo])}
                        />
                        <span><b>{s.codigo}</b> {s.nombre}</span>
                      </span>
                      <span className="num">{pesos(contrato.tarifas[s.codigo])}</span>
                    </label>
                  )
                })}
              </div>
              <div className="totales">
                <span>Servicios {pesos(total)}</span>
                <b>A cobrar en caja: {pesos(estimado)}</b>
              </div>
              {estimado > 0 && estimado < 1000 && <Aviso tipo="alerta">Menos de $1.000: Factus Pay no lo cobra por QR (regla V01).</Aviso>}
              <div className="acciones">
                <button className="btn" onClick={crear} disabled={ocupado || !sel.length}>Registrar admisión</button>
              </div>
            </>
          )}
        </div>

        <div className="tarjeta">
          <h2>2. Cobro con QR</h2>
          {!adm ? (
            <p className="vacio">Registra una admisión o elige una reciente.</p>
          ) : (
            <>
              <p>
                <b>{adm.codigo}</b> · {adm.nombres} {adm.apellidos} · <Estado valor={adm.estado} />
              </p>
              <LineaEstados estado={adm.estado} />
              {adm.nota_estado && <Aviso tipo={adm.estado === 'requiere_revision' || adm.estado === 'cobro_fallido' ? 'error' : 'alerta'}>{adm.nota_estado}</Aviso>}

              {qrVigente ? (
                <div className="qr" style={{ marginTop: 14 }}>
                  <img src={recaudo.qr} alt="QR Bre-B de Factus Pay" />
                  <div>
                    <div className="mudo">Valor a pagar</div>
                    <div className="cifra">{pesos(recaudo.monto)}</div>
                    <p>Llave Bre-B <span className="llave">{recaudo.breb_key}</span></p>
                    <p className="mudo">Referencia {recaudo.reference_code}</p>
                    <p>Vence en <span className="cuenta">{cuenta?.texto}</span></p>
                    <p className="mudo">Esperando el pago… (webhook o consulta cada 3 s)</p>
                    {esMock && (
                      <div className="acciones">
                        <button className="btn chico" onClick={() => simular('paid')}>Simular pago exitoso</button>
                        <button className="btn chico peligro" onClick={() => simular('rejected')}>Simular pago fallido</button>
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
        {recientes.length === 0 ? (
          <p className="vacio">Aún no hay admisiones.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Código</th><th>Paciente</th><th>EPS</th><th className="num">Cobro</th><th>Estado</th><th>Creada</th></tr>
            </thead>
            <tbody>
              {recientes.slice(0, 12).map((r) => (
                <tr key={r.id} className={`clic ${r.id === admisionId ? 'activo' : ''}`} onClick={() => { setAdm(null); setAdmisionId(r.id) }}>
                  <td className="nowrap">{r.codigo}</td><td>{r.paciente}</td><td>{r.eps}</td>
                  <td className="num">{pesos(r.monto_recaudo)}</td><td><Estado valor={r.estado} /></td><td>{fechaHora(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { api, fechaHora, pesos } from '../components/api'
import { Aviso, Cargando } from '../components/ui'

// Qué atrapa cada regla del validador, en palabras de negocio
const REGLAS: Record<string, string> = {
  V01: 'Monto fuera del rango que acepta Factus Pay',
  V02: 'Referencia de recaudo inválida o repetida',
  V03: 'Los pagos no suman el total de la factura',
  V04: 'Cliente sin nombre o razón social',
  V05: 'NIT con el dígito de verificación mal puesto',
  V06: 'Pago a crédito sin fecha de vencimiento',
  V07: 'Paciente sin tipo de documento de salud',
  V08: 'Paciente sin número de documento',
  V09: 'Ítem sin esquema o concepto de recaudo',
  V10: 'Recaudo para la EPS sin mandato',
  V11: 'Copago facturado sin pago confirmado',
  V12: 'Datos de salud (health) incompletos o inválidos',
  V13: 'Factura a la EPS sin contrato ni causal',
  V14: 'Cobertura SOAT o ARL sin póliza',
  V15: 'Copago pagado que no se descuenta a la EPS',
  V16: 'Copago todavía pendiente de pago',
  V17: 'Tarifa distinta a la pactada',
  V18: 'Observación de más de 500 caracteres',
  V19: 'Precios o cantidades con más de 2 decimales',
  V20: 'Nota crédito mayor al saldo de la factura',
  V21: 'Factura a la EPS sin periodo de facturación',
}
// Reglas que salieron de probar contra el sandbox real (la documentación decía otra cosa o no lo decía)
const DEL_SANDBOX = new Set(['V01', 'V12', 'V21'])

const ESTADOS_CONCILIACION: Record<string, [string, string]> = {
  conciliado: ['verde', 'Conciliado'],
  pagado_sin_factura: ['rojo', 'Pagado sin factura'],
  monto_distinto: ['rojo', 'Monto distinto'],
  no_registrado: ['ambar', 'No registrado aquí'],
  sin_pago_en_pay: ['ambar', 'Sin pago en Factus Pay'],
}
const ESTADOS_RADIAN: Record<string, [string, string]> = {
  aceptada: ['verde', 'Aceptada'],
  recibida: ['azul', 'Servicio recibido'],
  acuse: ['azul', 'Acuse de recibo'],
  reclamada: ['rojo', 'Reclamada'],
  sin_eventos: ['gris', 'Sin eventos'],
  error: ['rojo', 'Sin consultar'],
}
const TIPOS: Record<string, string> = { recaudoPay: 'Cobro QR', ssRecaudo: 'SS-Recaudo', ssCufe: 'SS-CUFE', notaCredito: 'Nota crédito' }

function Insignia({ mapa, valor }: { mapa: Record<string, [string, string]>; valor: string }) {
  const [color, texto] = mapa[valor] ?? ['gris', valor]
  return <span className={`estado ${color}`}>{texto}</span>
}

function useDatos<T>(ruta: string) {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const cargar = () => {
    setCargando(true)
    setError(null)
    return api<T>(ruta).then(setDatos).catch((e) => setError(e.message)).finally(() => setCargando(false))
  }
  useEffect(() => {
    void cargar()
  }, [])
  return { datos, error, cargando, cargar }
}

export default function Control() {
  const impacto = useDatos<any>('/api/control/impacto')
  const conc = useDatos<any>('/api/control/conciliacion')
  const radian = useDatos<any>('/api/control/radian')
  const [facturando, setFacturando] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const actualizar = () => {
    void impacto.cargar()
    void conc.cargar()
    void radian.cargar()
  }

  async function facturar(referencia: string) {
    setFacturando(referencia)
    setMensaje(null)
    try {
      const r = await api<any>('/api/control/conciliacion/facturar', { json: { reference_code: referencia } })
      await Promise.all([conc.cargar(), impacto.cargar()])
      setMensaje(
        r.factura?.estado === 'validada'
          ? { tipo: 'ok', texto: `Factura ${r.factura.numero} validada para ${referencia}.` }
          : { tipo: 'error', texto: `${referencia}: ${r.factura?.error_mensaje ?? r.paso}` },
      )
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    } finally {
      setFacturando(null)
    }
  }

  const i = impacto.datos
  const c = conc.datos
  return (
    <>
      <h1>Control y conciliación</h1>
      <p className="sub">
        Lo que el validador detuvo antes de llegar a la DIAN, la conciliación entre Factus Pay y Factus Facturación, y la respuesta de las EPS en RADIAN.
      </p>
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      <div className="rejilla cuatro" style={{ marginBottom: 18 }}>
        <div className="tarjeta kpi"><div className="e">Documentos detenidos antes de la DIAN</div><div className="v">{i ? i.documentos_detenidos : '—'}</div></div>
        <div className="tarjeta kpi"><div className="e">Valor detenido antes de enviarse</div><div className="v">{i ? pesos(i.valor_protegido) : '—'}</div></div>
        <div className="tarjeta kpi"><div className="e">Corregidos y luego validados</div><div className="v">{i ? `${i.corregidos_y_validados} de ${i.documentos_detenidos}` : '—'}</div></div>
        <div className="tarjeta kpi"><div className="e">Copagos pagados con factura</div><div className="v">{c ? (c.porcentaje === null ? 'Sin pagos' : `${c.porcentaje} %`) : '—'}</div></div>
      </div>

      <div className="rejilla dos">
        <div className="tarjeta">
          <h2>Glosas evitadas por regla</h2>
          {impacto.error && <Aviso tipo="error">{impacto.error}</Aviso>}
          {impacto.cargando && !i ? <Cargando texto="Leyendo la bitácora del validador…" /> : !i?.por_regla?.length ? (
            <p className="vacio">El validador todavía no ha detenido documentos. Prueba emitir una SS-CUFE sin contrato.</p>
          ) : (
            <table>
              <thead><tr><th>Regla</th><th>Qué evitó</th><th className="num">Documentos</th></tr></thead>
              <tbody>
                {i.por_regla.map((r: any) => (
                  <tr key={r.codigo}>
                    <td className="nowrap"><b>{r.codigo}</b></td>
                    <td>
                      {REGLAS[r.codigo] ?? r.ejemplo}
                      {DEL_SANDBOX.has(r.codigo) && <div className="mudo">Aprendida probando contra el sandbox de Factus</div>}
                    </td>
                    <td className="num">{r.documentos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {i && i.con_advertencias > 0 && <p className="nota">{i.con_advertencias} documento(s) salieron con advertencias (por ejemplo, tarifa distinta a la pactada).</p>}
        </div>

        <div className="tarjeta">
          <h2>Últimos documentos detenidos</h2>
          {!i?.ultimos?.length ? <p className="vacio">Sin registros todavía.</p> : (
            <table>
              <thead><tr><th>Documento</th><th>Reglas</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {i.ultimos.map((u: any, n: number) => (
                  <tr key={`${u.referencia}-${n}`}>
                    <td>{TIPOS[u.tipo] ?? u.tipo}<div className="mudo">{u.referencia} · {fechaHora(u.creado_en)}{u.origen === 'previsualizacion' ? ' · al validar' : ''}</div></td>
                    <td className="nowrap"><b>{u.codigos}</b></td>
                    <td className="num">{u.valor != null ? pesos(u.valor) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="tarjeta" style={{ marginTop: 18 }}>
        <h2>Conciliación Factus Pay ↔ Factus Facturación</h2>
        {conc.error && <Aviso tipo="error">{conc.error}</Aviso>}
        {conc.cargando && !c ? <Cargando texto="Consultando los recaudos en Factus Pay…" /> : c && (
          <>
            {c.error_pay && <Aviso tipo="error">No se pudo consultar Factus Pay: {c.error_pay}</Aviso>}
            {c.fuente === 'mock' && <Aviso tipo="alerta">Factus Pay en modo simulado: los recaudos simulados se pierden al reiniciar el servidor.</Aviso>}
            <p>
              Factus Pay reporta <b>{c.pagados_en_pay}</b> recaudo(s) pagado(s) con el prefijo <span className="llave">{c.prefijo}</span> por <b>{pesos(c.recaudado)}</b>.
              {' '}Con factura SS-Recaudo validada: <b>{c.conciliados}</b> por <b>{pesos(c.facturado)}</b>.
              {c.diferencia !== 0 && <> Diferencia: <b>{pesos(c.diferencia)}</b>.</>}
            </p>
            {c.items.length === 0 ? <p className="vacio">Todavía no hay recaudos pagados para conciliar.</p> : (
              <table>
                <thead><tr><th>Recaudo</th><th className="num">Pagado en Factus Pay</th><th>Factura SS-Recaudo</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {c.items.map((it: any) => (
                    <tr key={`${it.reference_code}-${it.estado}`}>
                      <td>{it.reference_code}<div className="mudo">{it.paciente ?? 'Sin admisión en SaludFactura'}{it.confirmado_por ? ` · confirmado por ${it.confirmado_por}` : ''}</div></td>
                      <td className="num">{it.monto_pay != null ? pesos(it.monto_pay) : '—'}{it.monto_local != null && it.monto_pay != null && it.monto_local !== it.monto_pay && <div className="mudo">esperado {pesos(it.monto_local)}</div>}</td>
                      <td>{it.factura_numero ?? <span className="mudo">{it.factura_estado ?? 'sin factura'}</span>}</td>
                      <td><Insignia mapa={ESTADOS_CONCILIACION} valor={it.estado} /></td>
                      <td>
                        {it.estado === 'pagado_sin_factura' && (
                          <button className="btn chico" disabled={facturando !== null} onClick={() => void facturar(it.reference_code)}>
                            {facturando === it.reference_code ? 'Facturando…' : 'Facturar ahora'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="nota">Regla del negocio: ningún copago cobrado en Factus Pay queda sin su factura SS-Recaudo. Si alguno aparece en rojo, se factura desde aquí.</p>
          </>
        )}
      </div>

      <div className="tarjeta" style={{ marginTop: 18 }}>
        <h2>Respuesta de las EPS en RADIAN</h2>
        {radian.error && <Aviso tipo="error">{radian.error}</Aviso>}
        {radian.cargando && !radian.datos ? <Cargando texto="Consultando eventos RADIAN en Factus…" /> : !radian.datos?.facturas?.length ? (
          <p className="vacio">Aún no hay facturas SS-CUFE validadas.</p>
        ) : (
          <table>
            <thead><tr><th>Factura a la EPS</th><th className="num">Neto</th><th>Estado RADIAN</th><th>Eventos</th></tr></thead>
            <tbody>
              {radian.datos.facturas.map((f: any) => (
                <tr key={f.id}>
                  <td>{f.numero}<div className="mudo">{f.eps}</div></td>
                  <td className="num">{pesos(f.total_neto)}</td>
                  <td><Insignia mapa={ESTADOS_RADIAN} valor={f.estado} /><div className="mudo">{f.detalle}</div></td>
                  <td>{f.eventos.length ? f.eventos.map((e: any) => <div key={`${e.codigo}-${e.fecha}`}><b>{e.codigo}</b> {e.nombre} <span className="mudo">{e.fecha}</span></div>) : <span className="mudo">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="nota">Eventos de la DIAN sobre cada factura: 030 acuse de recibo, 031 reclamo, 032 recibo del servicio, 033 aceptación expresa, 034 aceptación tácita. Un reclamo es una glosa anunciada.</p>
      </div>

      <div className="acciones"><button className="btn sec" onClick={actualizar}>Actualizar todo</button></div>
    </>
  )
}

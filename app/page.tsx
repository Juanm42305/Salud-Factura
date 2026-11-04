'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { api } from './components/api'

type Salud = any

function Fila({ ok, titulo, children }: { ok: boolean | undefined; titulo: string; children?: ReactNode }) {
  return (
    <div className="tarjeta">
      <div className="salud">
        <span className={`punto ${ok === undefined ? '' : ok ? 'ok' : 'mal'}`} />
        <h2 style={{ margin: 0 }}>{titulo}</h2>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  )
}

export default function Inicio() {
  const [s, setS] = useState<Salud | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function probar() {
    setCargando(true)
    setError(null)
    try {
      setS(await api('/api/salud'))
    } catch (e: any) {
      setError(e.message)
      setS(e.datos ?? null)
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => {
    void probar()
  }, [])

  return (
    <>
      <h1>Estado de la integración</h1>
      <p className="sub">GET /api/salud · prueba ante el jurado que ambas APIs de Factus responden con las credenciales sandbox.</p>

      {s && (
        <div className={`banda ${s.demo_lista ? 'ok' : 'mal'}`}>
          {s.demo_lista
            ? 'Listo para la demo: Factus Facturación y Factus Pay responden en sandbox, webhook con HTTPS y llave configurada.'
            : s.ok
              ? 'Las APIs responden, pero falta algo para la demo (modo simulado, URLs fuera de sandbox, HTTPS o llave del webhook). Revisa abajo.'
              : 'Hay un componente sin responder. Revisa abajo.'}
        </div>
      )}
      {error && !s && <div className="aviso error">{error}</div>}

      <div className="rejilla dos">
        <Fila ok={s?.factus?.ok} titulo="Factus Facturación">
          {s?.factus?.ok ? (
            <>
              <p className="mudo">
                Modo <b>{s.factus.modo}</b>
                {s.factus.token_minutos_restantes != null && <> · token vence en {s.factus.token_minutos_restantes} min</>}
                {' '}· rango facturas configurado: <b>{s.factus.rango_configurado ?? 'ninguno'}</b>, notas: <b>{s.factus.rango_notas_configurado ?? 'ninguno'}</b>
              </p>
              <table>
                <thead>
                  <tr><th>ID</th><th>Documento</th><th>Prefijo</th><th className="num">Actual</th></tr>
                </thead>
                <tbody>
                  {s.factus.rangos.map((r: any) => (
                    <tr key={r.id}><td>{r.id}</td><td>{r.documento}</td><td>{r.prefijo}</td><td className="num">{r.actual}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="aviso error">{s?.factus?.error ?? '…'}</div>
          )}
        </Fila>

        <Fila ok={s?.factus_pay?.ok} titulo="Factus Pay">
          {s?.factus_pay?.ok ? (
            <p className="mudo">Modo <b>{s.factus_pay.modo}</b> · {s.factus_pay.detalle}</p>
          ) : (
            <div className="aviso error">{s?.factus_pay?.error ?? '…'}</div>
          )}
        </Fila>

        <Fila ok={s ? s.webhook.https && s.webhook.llave_configurada : undefined} titulo="Webhook de Factus Pay">
          {s && (
            <>
              <p className="mudo">Registra esta URL y la llave en el panel de Factus Pay:</p>
              <p><span className="llave">{s.webhook.url}</span></p>
              <p className="mudo">HTTPS: {s.webhook.https ? 'sí' : 'no'} · llave de 32+ caracteres: {s.webhook.llave_configurada ? 'sí' : 'no'}</p>
            </>
          )}
        </Fila>

        <Fila ok={s?.base_datos?.ok} titulo="Base de datos">
          {s && (
            <p className="mudo">
              {s.base_datos.ok ? 'PostgreSQL responde.' : s.base_datos.error} · URLs en sandbox: {s.sandbox ? 'sí' : 'NO'} · worker:{' '}
              {s.worker ? 'activo' : 'no (Vercel)'} · {s.ms} ms
            </p>
          )}
        </Fila>
      </div>

      <div className="acciones">
        <button className="btn" onClick={probar} disabled={cargando}>{cargando ? 'Probando…' : 'Probar de nuevo'}</button>
        <a className="btn sec" href="/caja">Ir a caja</a>
      </div>
    </>
  )
}

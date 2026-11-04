'use client'
// Segundo paso del acceso de administración: código de 6 dígitos de una app autenticadora
// (Google Authenticator, Microsoft Authenticator, Authy…). La primera vez muestra el QR para registrarla.
import { useEffect, useState, type FormEvent } from 'react'
import { useSesion } from './sesion'
import { Aviso } from './ui'

export default function PasoMfa() {
  const { mfa, prepararInscripcion, completarMfa, salir, saliendo } = useSesion()
  const [qr, setQr] = useState<{ qr: string; secreto: string } | null>(null)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (mfa !== 'inscribir') return
    let activo = true
    prepararInscripcion()
      .then((r) => { if (activo) setQr(r) })
      .catch((e) => { if (activo) setError(e instanceof Error ? e.message : 'No se pudo preparar la verificación') })
    return () => { activo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mfa])

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (ocupado) return
    setError(null); setOcupado(true)
    try { await completarMfa(codigo) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo verificar el código'); setCodigo('') }
    finally { setOcupado(false) }
  }

  const inscribir = mfa === 'inscribir'
  return <>
    <h2 id="titulo-acceso">Verificación en dos pasos</h2>
    <p className="sub">{inscribir
      ? 'Por seguridad, la cuenta de administración necesita un código además de la contraseña. Escanea este QR con tu app autenticadora (Google Authenticator, Microsoft Authenticator o Authy).'
      : 'Escribe el código de 6 dígitos que muestra tu app autenticadora.'}</p>
    {inscribir && (qr
      ? <div className="tarjeta" style={{ textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.qr} alt="Código QR para registrar SaludFactura en la app autenticadora" width={200} height={200} />
          <p className="nota">¿No puedes escanearlo? Escribe esta clave en la app: <code style={{ wordBreak: 'break-all' }}>{qr.secreto}</code></p>
        </div>
      : !error && <p className="mudo">Preparando el código QR…</p>)}
    <form onSubmit={enviar} aria-busy={ocupado}>
      <label htmlFor="codigo-mfa">Código de verificación</label>
      <input id="codigo-mfa" name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
        placeholder="000000" value={codigo} onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '')); setError(null) }}
        required disabled={ocupado || (inscribir && !qr)} aria-describedby={error ? 'error-mfa' : undefined} autoFocus />
      {error && <div id="error-mfa"><Aviso tipo="error">{error}</Aviso></div>}
      <button type="submit" className="btn login-enviar" disabled={ocupado || codigo.length !== 6 || (inscribir && !qr)}>{ocupado ? 'Verificando…' : 'Verificar y entrar →'}</button>
    </form>
    <button type="button" className="btn sec login-enviar" disabled={saliendo || ocupado} onClick={() => { void salir() }}>{saliendo ? 'Cerrando…' : 'Cancelar y salir'}</button>
  </>
}

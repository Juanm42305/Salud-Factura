'use client'
import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { useSesion } from '../components/sesion'
import { destinoTrasLogin, type Rol } from '../components/acceso'
import { supabaseConfigurado } from '../components/supabase'
import { Aviso } from '../components/ui'
import PasoMfa from '../components/pasoMfa'

export default function Login() {
  const { iniciar, usuario, salir, saliendo, mfa } = useSesion()
  const [rol, setRol] = useState<Rol>('usuario')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('acceso') === 'administrador') setRol('administrador')
  }, [])

  function cambiarRol(nuevo: Rol) {
    setRol(nuevo); setCorreo(''); setClave(''); setError(null); setVisible(false)
  }
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (ocupado) return
    setError(null); setOcupado(true)
    try { await iniciar(correo, clave, rol) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión') }
    finally { setOcupado(false); setClave('') }
  }

  return <div className="login-contenedor">
    <section className="login-presentacion" aria-labelledby="login-presentacion">
      <div className="marca"><span className="marca-icono" aria-hidden="true">+</span><span>Salud<b>Factura</b><small>GESTIÓN DE RECAUDO EN SALUD</small></span></div>
      <div className="login-mensaje"><span className="login-etiqueta">CADA ATENCIÓN, CONECTADA</span><h1 id="login-presentacion">Del primer cobro<br />a la última factura.</h1><p>Un solo espacio para gestionar el recaudo de pacientes, la facturación a EPS y el seguimiento de tu cartera.</p>
        <ol className="login-pasos"><li><span>01</span><div><b>Recauda con claridad</b><p>Admisiones y cobros con QR.</p></div></li><li><span>02</span><div><b>Factura con trazabilidad</b><p>Copagos y cuentas de cada atención.</p></div></li><li><span>03</span><div><b>Mantén el control</b><p>Glosas, notas crédito y cartera por EPS.</p></div></li></ol>
      </div><p className="login-pie">Factus Pay + Factus Facturación · Sandbox</p>
    </section>
    <section className="login-formulario" aria-labelledby="titulo-acceso">
      <div className="login-panel"><span className="sello">● Acceso a SaludFactura</span>{mfa && !usuario ? <PasoMfa /> : <><h2 id="titulo-acceso">{rol === 'administrador' ? 'Acceso de administración' : 'Bienvenido a SaludFactura'}</h2><p className="sub">{rol === 'administrador' ? 'Ingresa con tu cuenta de administrador para supervisar la plataforma.' : 'Ingresa con tu cuenta de usuario para gestionar las operaciones de tu IPS.'}</p>
        {usuario ? <><Aviso tipo="ok">Tienes una sesión de {usuario.rol === 'administrador' ? 'administración' : 'usuario'} abierta.</Aviso><Link className="btn login-enviar" href={destinoTrasLogin(null, usuario.rol)}>Continuar al espacio de trabajo</Link><button className="btn sec login-enviar" disabled={saliendo} onClick={() => { void salir() }}>{saliendo ? 'Cerrando…' : 'Cambiar de cuenta'}</button></> : <>
          <div className="login-roles" role="group" aria-label="Tipo de acceso"><button type="button" aria-pressed={rol === 'usuario'} onClick={() => cambiarRol('usuario')} disabled={ocupado}>Usuario</button><button type="button" aria-pressed={rol === 'administrador'} onClick={() => cambiarRol('administrador')} disabled={ocupado}>Administración</button></div>
          {!supabaseConfigurado && <Aviso tipo="alerta">El acceso está pendiente de configurar. Contacta al responsable de la plataforma.</Aviso>}
          <form onSubmit={enviar} aria-busy={ocupado}>
            <label htmlFor="correo-login">Correo electrónico</label><input id="correo-login" name="email" type="email" autoComplete="username" placeholder="tu@correo.com" value={correo} onChange={e => { setCorreo(e.target.value); setError(null) }} required disabled={ocupado} aria-describedby={error ? 'error-login' : undefined} />
            <label htmlFor="clave-login">Contraseña</label><div className="login-clave"><input id="clave-login" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={clave} onChange={e => { setClave(e.target.value); setError(null) }} placeholder="Ingresa tu contraseña" required disabled={ocupado} aria-describedby={error ? 'error-login' : undefined} /><button type="button" disabled={ocupado} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button></div>
            {error && <div id="error-login"><Aviso tipo="error">{error}</Aviso></div>}
            <button type="submit" className="btn login-enviar" disabled={!supabaseConfigurado || ocupado || !correo.trim() || !clave}>{ocupado ? 'Ingresando…' : 'Iniciar sesión →'}</button>
          </form>
          <p className="nota">¿Aún no tienes cuenta o no puedes ingresar? Contacta al administrador de tu IPS para gestionar tu acceso.</p>
        </>}</>}
      </div>
    </section>
  </div>
}

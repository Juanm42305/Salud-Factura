'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Navegacion from './navegacion'
import { Aviso, Cargando } from './ui'
import { destinoTrasLogin, esRutaAdministrativa, puedeAcceder, usuarioDesdeSupabase, type Rol, type Usuario } from './acceso'
import { getSupabase, supabaseConfigurado } from './supabase'

interface ContextoSesion {
  usuario: Usuario | null
  iniciar: (correo: string, clave: string, rol: Rol) => Promise<void>
  salir: () => Promise<void>
  saliendo: boolean
}
const Sesion = createContext<ContextoSesion | null>(null)
export function useSesion() {
  const sesion = useContext(Sesion)
  if (!sesion) throw new Error('La sesión debe utilizarse dentro del espacio de trabajo')
  return sesion
}

export default function EspacioTrabajo({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [listo, setListo] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [errorSesion, setErrorSesion] = useState<string | null>(null)
  const entrando = useRef(false)
  const ruta = usePathname()
  const router = useRouter()
  const esLogin = ruta === '/login'

  useEffect(() => {
    if (!supabaseConfigurado) { setListo(true); return }
    let activo = true
    let revision = 0
    const cliente = getSupabase()
    const { data } = cliente.auth.onAuthStateChange((evento, session) => {
      if (!activo || evento === 'INITIAL_SESSION') return
      revision++
      if (!entrando.current) setUsuario(session?.user ? usuarioDesdeSupabase(session.user) : null)
      setListo(true)
    })
    const revisionInicial = revision
    void cliente.auth.getUser().then(({ data, error }) => {
      if (!activo || revision !== revisionInicial) return
      setUsuario(!error && data.user ? usuarioDesdeSupabase(data.user) : null)
      setListo(true)
    }).catch(() => { if (activo && revision === revisionInicial) { setUsuario(null); setListo(true) } })
    return () => { activo = false; data.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (listo && !usuario && !esLogin) router.replace(`/login?acceso=${esRutaAdministrativa(ruta) ? 'administrador' : 'usuario'}&desde=${encodeURIComponent(ruta)}`)
  }, [listo, usuario, esLogin, ruta, router])

  async function iniciar(correo: string, clave: string, rol: Rol) {
    setErrorSesion(null)
    entrando.current = true
    try {
      const cliente = getSupabase()
      const { data, error } = await cliente.auth.signInWithPassword({ email: correo.trim(), password: clave })
      if (error) {
        if (error.code === 'invalid_credentials') throw new Error('El correo o la contraseña no son correctos.')
        if (error.code === 'email_not_confirmed') throw new Error('Confirma tu correo electrónico antes de ingresar.')
        if (error.status === 429) throw new Error('Hay demasiados intentos. Espera un momento antes de volver a ingresar.')
        throw new Error('No se pudo iniciar sesión. Comprueba tu conexión o contacta al administrador.')
      }
      if (!data.user) throw new Error('No se recibió una cuenta válida de Supabase.')
      const nueva = usuarioDesdeSupabase(data.user)
      if (nueva.rol !== rol) {
        const { error: errorSalida } = await cliente.auth.signOut({ scope: 'local' })
        if (errorSalida) throw new Error('No se pudo cerrar la sesión. Recarga la página para revisar tu acceso.')
        setUsuario(null)
        throw new Error(`Esta cuenta corresponde al acceso de ${nueva.rol === 'administrador' ? 'Administración' : 'Usuario'}. Selecciona ese tipo de acceso.`)
      }
      setUsuario(nueva)
      router.replace(destinoTrasLogin(new URLSearchParams(window.location.search).get('desde'), nueva.rol))
    } finally { entrando.current = false }
  }

  async function salir() {
    if (saliendo) return
    setSaliendo(true); setErrorSesion(null)
    try {
      const { error } = await getSupabase().auth.signOut({ scope: 'local' })
      if (error) throw error
      setUsuario(null)
      router.replace('/login')
    } catch { setErrorSesion('No se pudo cerrar la sesión. Revisa tu conexión e inténtalo nuevamente.') }
    finally { setSaliendo(false) }
  }

  return <Sesion.Provider value={{ usuario, iniciar, salir, saliendo }}>
    {!listo || (!usuario && !esLogin) ? <main className="sesion-carga" id="contenido"><Cargando texto="Comprobando acceso…" /></main>
      : esLogin ? <main className="login-main" id="contenido" tabIndex={-1}>{errorSesion && <Aviso tipo="error">{errorSesion}</Aviso>}{children}</main>
      : <><Navegacion /><main id="contenido" tabIndex={-1}>{errorSesion && <Aviso tipo="error">{errorSesion}</Aviso>}{usuario && !puedeAcceder(usuario.rol, ruta) ? <section className="tarjeta" role="alert"><h1>Acceso de administración</h1><p className="sub">Esta sección requiere una cuenta de administrador.</p><div className="acciones"><Link href="/caja" className="btn">Volver a Caja</Link><button className="btn sec" disabled={saliendo} onClick={() => { void salir() }}>Cambiar de cuenta</button></div></section> : children}</main></>}
  </Sesion.Provider>
}

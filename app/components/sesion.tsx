'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Navegacion from './navegacion'
import { Aviso, Cargando } from './ui'
import { destinoTrasLogin, esRutaAdministrativa, puedeAcceder, usuarioDesdeSupabase, type Rol, type Usuario } from './acceso'
import { getSupabase, supabaseConfigurado } from './supabase'

/** Verificación en dos pasos del administrador: inscribir la app autenticadora (primera vez) o pedir su código. */
export type PasoMfa = 'inscribir' | 'verificar'

interface ContextoSesion {
  usuario: Usuario | null
  iniciar: (correo: string, clave: string, rol: Rol) => Promise<void>
  salir: () => Promise<void>
  saliendo: boolean
  mfa: PasoMfa | null
  prepararInscripcion: () => Promise<{ qr: string; secreto: string }>
  completarMfa: (codigo: string) => Promise<void>
}

// Nivel de verificación de la sesión (aal1 = solo contraseña, aal2 = contraseña + código).
// Solo decide qué pantalla mostrar: quien protege los datos es el backend, que verifica la firma del token.
function aalDeToken(token: string | undefined): string {
  try {
    const base = token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base)).aal ?? 'aal1'
  } catch {
    return 'aal1'
  }
}

async function pasoMfaPendiente(u: Usuario): Promise<PasoMfa | null> {
  if (u.rol !== 'administrador') return null
  const { data, error } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw new Error('No se pudo comprobar la verificación en dos pasos. Inténtalo de nuevo.')
  if (data.currentLevel === 'aal2') return null
  return data.nextLevel === 'aal2' ? 'verificar' : 'inscribir'
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
  const [mfa, setMfa] = useState<PasoMfa | null>(null)
  const factorInscrito = useRef<string | null>(null)
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
      if (!entrando.current) {
        const u = session?.user ? usuarioDesdeSupabase(session.user) : null
        // Un administrador sin el código verificado no entra al espacio de trabajo
        setUsuario(u && (u.rol !== 'administrador' || aalDeToken(session?.access_token) === 'aal2') ? u : null)
      }
      setListo(true)
    })
    const revisionInicial = revision
    void cliente.auth.getUser().then(async ({ data, error }) => {
      if (!activo || revision !== revisionInicial) return
      const u = !error && data.user ? usuarioDesdeSupabase(data.user) : null
      const paso = u ? await pasoMfaPendiente(u) : null
      if (!activo || revision !== revisionInicial) return
      setMfa(paso)
      setUsuario(paso ? null : u)
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
      const paso = await pasoMfaPendiente(nueva)
      if (paso) { setMfa(paso); return } // la contraseña sola no basta: falta el código
      setUsuario(nueva)
      router.replace(destinoTrasLogin(new URLSearchParams(window.location.search).get('desde'), nueva.rol))
    } finally { entrando.current = false }
  }

  /** Primera vez: registra la app autenticadora y devuelve el QR para escanearlo. */
  async function prepararInscripcion() {
    const cliente = getSupabase()
    // Un intento anterior sin terminar deja un factor sin verificar: se borra para empezar limpio
    const { data: lista } = await cliente.auth.mfa.listFactors()
    for (const f of lista?.all ?? []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') await cliente.auth.mfa.unenroll({ factorId: f.id })
    }
    const { data, error } = await cliente.auth.mfa.enroll({ factorType: 'totp', friendlyName: `SaludFactura ${new Date().toISOString().slice(0, 16)}` })
    if (error || !data) throw new Error('No se pudo preparar la verificación en dos pasos. Inténtalo de nuevo.')
    factorInscrito.current = data.id
    return { qr: data.totp.qr_code, secreto: data.totp.secret }
  }

  /** Verifica el código de 6 dígitos; la sesión pasa a aal2 y se entra al espacio de trabajo. */
  async function completarMfa(codigo: string) {
    const cliente = getSupabase()
    let factorId = mfa === 'inscribir' ? factorInscrito.current : null
    if (!factorId) {
      const { data } = await cliente.auth.mfa.listFactors()
      factorId = data?.totp?.[0]?.id ?? null
    }
    if (!factorId) throw new Error('No hay una app autenticadora registrada para esta cuenta.')
    entrando.current = true
    try {
      const { error } = await cliente.auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() })
      if (error) {
        if (error.status === 429) throw new Error('Demasiados intentos. Espera un momento antes de volver a intentarlo.')
        throw new Error('El código no es correcto o ya venció. Escribe el código que muestra ahora tu app.')
      }
      const { data } = await cliente.auth.getUser()
      if (!data.user) throw new Error('La sesión terminó. Inicia sesión de nuevo.')
      const u = usuarioDesdeSupabase(data.user)
      factorInscrito.current = null
      setMfa(null)
      setUsuario(u)
      router.replace(destinoTrasLogin(new URLSearchParams(window.location.search).get('desde'), u.rol))
    } finally { entrando.current = false }
  }

  async function salir() {
    if (saliendo) return
    setSaliendo(true); setErrorSesion(null)
    try {
      const { error } = await getSupabase().auth.signOut({ scope: 'local' })
      if (error) throw error
      setUsuario(null)
      setMfa(null)
      factorInscrito.current = null
      router.replace('/login')
    } catch { setErrorSesion('No se pudo cerrar la sesión. Revisa tu conexión e inténtalo nuevamente.') }
    finally { setSaliendo(false) }
  }

  return <Sesion.Provider value={{ usuario, iniciar, salir, saliendo, mfa, prepararInscripcion, completarMfa }}>
    {!listo || (!usuario && !esLogin) ? <main className="sesion-carga" id="contenido"><Cargando texto="Comprobando acceso…" /></main>
      : esLogin ? <main className="login-main" id="contenido" tabIndex={-1}>{errorSesion && <Aviso tipo="error">{errorSesion}</Aviso>}{children}</main>
      : <><Navegacion /><main id="contenido" tabIndex={-1}>{errorSesion && <Aviso tipo="error">{errorSesion}</Aviso>}{usuario && !puedeAcceder(usuario.rol, ruta) ? <section className="tarjeta" role="alert"><h1>Acceso de administración</h1><p className="sub">Esta sección requiere una cuenta de administrador.</p><div className="acciones"><Link href="/caja" className="btn">Volver a Caja</Link><button className="btn sec" disabled={saliendo} onClick={() => { void salir() }}>Cambiar de cuenta</button></div></section> : children}</main></>}
  </Sesion.Provider>
}

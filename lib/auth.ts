// Control de acceso del backend: toda llamada a /api/* debe traer una sesión válida de Supabase Auth.
// - La firma del token se verifica con las llaves públicas del proyecto (getClaims), no se confía en el navegador.
// - El rol sale de app_metadata.role, que solo se asigna desde un entorno administrativo (nunca user_metadata).
// - Una cuenta sin rol asignado (por ejemplo, alguien que se registró solo) no entra.
// - El administrador debe haber pasado la verificación en dos pasos (código de la app autenticadora → aal2).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Rol = 'usuario' | 'administrador'

export interface Reclamos {
  sub?: string
  email?: string
  aal?: string
  app_metadata?: { role?: unknown }
}

export type Decision =
  | { ok: true; usuario: { id: string; correo: string; rol: Rol; aal: string } }
  | { ok: false; status: 401 | 403 | 503; error: string; codigo: string }

/** Rutas de la API que solo puede usar un administrador. */
// /api/dev/simular-pago lo usan los botones de Caja y solo responde en modo simulado (FACTUS_PAY_MOCK=true)
export const esApiAdministrativa = (ruta: string) => ruta === '/api/salud'

export function rolDesdeReclamos(r: Reclamos): Rol | null {
  const role = r.app_metadata?.role
  if (role === 'admin' || role === 'administrador') return 'administrador'
  if (role === 'usuario' || role === 'user') return 'usuario'
  return null
}

/** Regla de acceso, sin red: se prueba con pruebas unitarias. */
export function decidirAcceso(reclamos: Reclamos | null, ruta: string): Decision {
  if (!reclamos?.sub) return { ok: false, status: 401, error: 'Inicia sesión para continuar', codigo: 'sin_sesion' }
  const rol = rolDesdeReclamos(reclamos)
  if (!rol) return { ok: false, status: 403, error: 'Tu cuenta no tiene un rol asignado. Contacta al administrador.', codigo: 'sin_rol' }
  const aal = reclamos.aal ?? 'aal1'
  if (rol === 'administrador' && aal !== 'aal2')
    return { ok: false, status: 403, error: 'Completa la verificación con el código de tu app autenticadora', codigo: 'mfa_requerido' }
  if (esApiAdministrativa(ruta) && rol !== 'administrador')
    return { ok: false, status: 403, error: 'Esta operación requiere una cuenta de administrador', codigo: 'solo_admin' }
  return { ok: true, usuario: { id: reclamos.sub, correo: reclamos.email ?? '', rol, aal } }
}

let cliente: SupabaseClient | undefined
function supabaseServidor(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !clave) return null
  cliente ??= createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  return cliente
}

export function tokenDe(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')
  return m ? m[1].trim() : null
}

/** Verifica la sesión de una solicitud a /api/*. Si Auth no está configurado, niega el acceso (falla cerrado). */
export async function verificarSolicitud(req: Request, ruta: string): Promise<Decision> {
  const sb = supabaseServidor()
  if (!sb) return { ok: false, status: 503, error: 'El control de acceso no está configurado en el servidor', codigo: 'auth_sin_configurar' }
  const token = tokenDe(req)
  if (!token) return decidirAcceso(null, ruta)
  try {
    const { data, error } = await sb.auth.getClaims(token)
    if (error || !data?.claims) return { ok: false, status: 401, error: 'La sesión no es válida o venció. Inicia sesión de nuevo.', codigo: 'sesion_invalida' }
    return decidirAcceso(data.claims as Reclamos, ruta)
  } catch {
    return { ok: false, status: 401, error: 'La sesión no es válida o venció. Inicia sesión de nuevo.', codigo: 'sesion_invalida' }
  }
}

import type { User } from '@supabase/supabase-js'

export type Rol = 'usuario' | 'administrador'
export interface Usuario { id: string; correo: string; nombre: string; rol: Rol }

// app_metadata solo debe modificarse desde un entorno administrativo confiable.
// user_metadata nunca se utiliza para otorgar permisos.
export function usuarioDesdeSupabase(user: User): Usuario {
  const role: unknown = user.app_metadata?.role
  return {
    id: user.id,
    correo: user.email ?? '',
    nombre: user.email?.split('@')[0] ?? 'Usuario',
    rol: role === 'admin' || role === 'administrador' ? 'administrador' : 'usuario',
  }
}

export function esRutaAdministrativa(ruta: string): boolean {
  return ruta === '/' || ruta === '/administracion' || ruta.startsWith('/administracion/')
}
export function puedeAcceder(rol: Rol, ruta: string): boolean {
  return rol === 'administrador' || !esRutaAdministrativa(ruta)
}
export function destinoTrasLogin(destino: string | null, rol: Rol): string {
  return destino && ['/', '/administracion', '/caja', '/facturacion', '/glosas', '/cartera'].includes(destino) && puedeAcceder(rol, destino)
    ? destino : rol === 'administrador' ? '/administracion' : '/caja'
}

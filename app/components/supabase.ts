import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const supabaseConfigurado = Boolean(url && clave)
let cliente: SupabaseClient | undefined

export function getSupabase(): SupabaseClient {
  if (!url || !clave) throw new Error('Falta configurar la conexión con Supabase Auth.')
  if (!cliente) cliente = createClient(url, clave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return cliente
}

export async function cabecerasSesion(): Promise<Record<string, string>> {
  if (!supabaseConfigurado) return {}
  const { data, error } = await getSupabase().auth.getSession()
  if (error) throw new Error('No se pudo recuperar la sesión. Vuelve a iniciar sesión.')
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
}

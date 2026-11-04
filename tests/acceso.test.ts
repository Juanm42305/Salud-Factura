// Reglas de acceso del backend (lib/auth.ts): sesión, rol asignado y verificación en dos pasos del administrador.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decidirAcceso, esApiAdministrativa, rolDesdeReclamos, tokenDe, verificarSolicitud } from '../lib/auth'

const admin = (aal: string) => ({ sub: 'u1', email: 'admin@ips.test', aal, app_metadata: { role: 'admin' } })
const usuario = { sub: 'u2', email: 'caja@ips.test', aal: 'aal1', app_metadata: { role: 'usuario' } }

describe('Control de acceso a /api/*', () => {
  it('sin sesión → 401', () => {
    const d = decidirAcceso(null, '/api/admisiones')
    assert.equal(d.ok, false)
    assert.equal(!d.ok && d.status, 401)
  })

  it('cuenta sin rol asignado (registro propio) → 403, aunque tenga sesión', () => {
    const d = decidirAcceso({ sub: 'x', aal: 'aal1', app_metadata: {} }, '/api/admisiones')
    assert.equal(!d.ok && d.codigo, 'sin_rol')
  })

  it('el rol en user_metadata no cuenta: solo app_metadata', () => {
    assert.equal(rolDesdeReclamos({ sub: 'x', user_metadata: { role: 'admin' } } as any), null)
  })

  it('administrador sin código de verificación (aal1) → 403 mfa_requerido', () => {
    const d = decidirAcceso(admin('aal1'), '/api/cartera')
    assert.equal(!d.ok && d.codigo, 'mfa_requerido')
  })

  it('administrador con código verificado (aal2) → pasa, incluso a rutas administrativas', () => {
    assert.equal(decidirAcceso(admin('aal2'), '/api/salud').ok, true)
  })

  it('usuario con rol → pasa a las operaciones', () => {
    assert.equal(decidirAcceso(usuario, '/api/admisiones').ok, true)
  })

  it('usuario normal no entra a rutas administrativas', () => {
    assert.ok(esApiAdministrativa('/api/salud') && esApiAdministrativa('/api/dev/simular-pago'))
    const d = decidirAcceso(usuario, '/api/salud')
    assert.equal(!d.ok && d.codigo, 'solo_admin')
  })

  it('lee el token Bearer del encabezado', () => {
    assert.equal(tokenDe(new Request('https://x.test', { headers: { Authorization: 'Bearer abc.def' } })), 'abc.def')
    assert.equal(tokenDe(new Request('https://x.test')), null)
  })

  it('sin Supabase configurado en el servidor → 503 (falla cerrado, nunca abre)', async () => {
    const antes = process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    try {
      const d = await verificarSolicitud(new Request('https://x.test/api/cartera'), '/api/cartera')
      assert.equal(!d.ok && d.status, 503)
    } finally {
      if (antes !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = antes
    }
  })
})

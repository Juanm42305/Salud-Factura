import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { User } from '@supabase/supabase-js'
import { destinoTrasLogin, puedeAcceder, usuarioDesdeSupabase } from './acceso'

function cuenta(app: Record<string, unknown> = {}, propio: Record<string, unknown> = {}) {
  return { id: 'prueba', email: 'prueba@example.invalid', app_metadata: app, user_metadata: propio } as User
}

describe('roles de acceso de SaludFactura', () => {
  it('ignora permisos introducidos en metadatos editables por el usuario', () => {
    assert.equal(usuarioDesdeSupabase(cuenta({}, { role: 'administrador' })).rol, 'usuario')
  })
  it('acepta administración solo desde app_metadata', () => {
    for (const role of ['admin', 'administrador']) assert.equal(usuarioDesdeSupabase(cuenta({ role })).rol, 'administrador')
    for (const role of [undefined, 'usuario', 'desconocido', true]) assert.equal(usuarioDesdeSupabase(cuenta({ role })).rol, 'usuario')
  })
  it('no copia contraseñas ni tokens al perfil de presentación', () => {
    assert.deepEqual(Object.keys(usuarioDesdeSupabase(cuenta())).sort(), ['correo', 'id', 'nombre', 'rol'])
  })
  it('reserva administración e integración para el administrador', () => {
    for (const ruta of ['/', '/administracion', '/administracion/usuarios']) {
      assert.equal(puedeAcceder('usuario', ruta), false)
      assert.equal(puedeAcceder('administrador', ruta), true)
    }
    for (const ruta of ['/caja', '/facturacion', '/glosas', '/cartera']) assert.equal(puedeAcceder('usuario', ruta), true)
  })
  it('no acepta redirecciones externas ni rutas internas ajenas al flujo', () => {
    for (const rol of ['usuario', 'administrador'] as const) {
      for (const ruta of [null, '//example.com', 'https://example.com', '/api/salud', '/login']) {
        assert.equal(destinoTrasLogin(ruta, rol), rol === 'administrador' ? '/administracion' : '/caja')
      }
    }
    assert.equal(destinoTrasLogin('/administracion', 'usuario'), '/caja')
    assert.equal(destinoTrasLogin('/administracion', 'administrador'), '/administracion')
    assert.equal(destinoTrasLogin('/cartera', 'usuario'), '/cartera')
  })
})

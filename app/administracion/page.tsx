'use client'
import Link from 'next/link'
import { useSesion } from '../components/sesion'

export default function Administracion() {
  const { usuario } = useSesion()
  return <>
    <h1>Panel de administración</h1>
    <p className="sub">Bienvenido, {usuario?.nombre}. Supervisa las operaciones de SaludFactura y consulta los servicios de integración.</p>
    <div className="rejilla dos">
      <div className="tarjeta"><h2>Supervisión de operaciones</h2><p className="mudo">Consulta la cartera de las EPS y el seguimiento de las objeciones a facturas.</p><div className="acciones"><Link className="btn" href="/cartera">Ver cartera</Link><Link className="btn sec" href="/glosas">Revisar glosas</Link></div></div>
      <div className="tarjeta"><h2>Estado de los servicios</h2><p className="mudo">Consulta la conexión con Factus Facturación, Factus Pay, el webhook y la base de datos.</p><div className="acciones"><Link className="btn" href="/">Revisar integración</Link></div></div>
    </div>
    <div className="tarjeta" style={{ marginTop: 22 }}><h2>Perfiles de acceso</h2><table><thead><tr><th>Perfil</th><th>Alcance de la interfaz</th></tr></thead><tbody><tr><td><b>Usuario</b></td><td>Caja, Facturación EPS, Glosas y Cartera.</td></tr><tr><td><b>Administración</b></td><td>Todos los módulos, este panel y el diagnóstico de integraciones.</td></tr></tbody></table><p className="nota">La creación de cuentas y la asignación de administradores se gestionan desde el servicio de autenticación. Este panel no modifica los permisos de las cuentas.</p></div>
  </>
}

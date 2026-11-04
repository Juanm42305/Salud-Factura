'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSesion } from './sesion'
import { puedeAcceder } from './acceso'

const enlaces = [
  ['/administracion', '↗', 'Administración', 'Panel del administrador'],
  ['/caja', '01', 'Caja', 'Admisiones y recaudos'],
  ['/facturacion', '02', 'Facturación EPS', 'Cierre de atenciones'],
  ['/glosas', '03', 'Glosas', 'Auditoría y notas crédito'],
  ['/cartera', '04', 'Cartera', 'Balance por EPS'],
  ['/', '↗', 'Integración', 'Estado de los servicios'],
] as const

export default function Navegacion() {
  const ruta = usePathname()
  const { usuario, salir, saliendo } = useSesion()
  return <>
    <a className="saltar" href="#contenido">Saltar al contenido</a>
    <aside className="lateral">
      <Link href="/caja" className="marca"><span className="marca-icono" aria-hidden="true">+</span><span>Salud<b>Factura</b><small>GESTIÓN DE RECAUDO EN SALUD</small></span></Link>
      <div className="nav-titulo">ESPACIO DE TRABAJO</div>
      <nav aria-label="Navegación principal">{enlaces.filter(([href]) => usuario && puedeAcceder(usuario.rol, href)).map(([href, numero, nombre, detalle]) => <Link key={href} href={href} className={ruta === href ? 'seleccionado' : ''} aria-current={ruta === href ? 'page' : undefined}><span className="nav-numero">{numero}</span><span>{nombre}<small>{detalle}</small></span></Link>)}</nav>
      <div className="lateral-pie"><span className="sello">● Ambiente Sandbox</span><p>Datos de demostración.<br />Sin transacciones de dinero real.</p></div>
    </aside>
    <header className="cabecera"><span>Operaciones <span aria-hidden="true">/</span> <b>{enlaces.find(([href]) => href === ruta)?.[2] ?? 'SaludFactura'}</b></span><div className="sesion-cuenta"><span className="sesion-correo">{usuario?.correo}<small>{usuario?.rol === 'administrador' ? 'Administración' : 'Usuario operativo'}</small></span><button className="btn sec chico" disabled={saliendo} onClick={() => { void salir() }}>{saliendo ? 'Cerrando…' : 'Cerrar sesión'}</button></div></header>
  </>
}

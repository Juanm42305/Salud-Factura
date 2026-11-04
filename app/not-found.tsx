import Link from 'next/link'
export default function NoEncontrado() {
  return <section className="tarjeta"><p className="mudo">ERROR 404</p><h1>Esta página no existe</h1><p className="sub">Accede a una sección desde el menú o regresa a Caja para continuar.</p><Link className="btn" href="/caja">Ir a Caja</Link></section>
}

'use client'
import Link from 'next/link'

export default function ErrorPantalla({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="tarjeta" role="alert"><h1>No pudimos mostrar esta pantalla</h1><p className="sub">Ocurrió un error al cargar la información. Intenta nuevamente o vuelve a Caja para consultar el estado de la atención.</p><div className="acciones"><button className="btn" onClick={reset}>Intentar de nuevo</button><Link className="btn sec" href="/caja">Volver a Caja</Link></div></section>
}

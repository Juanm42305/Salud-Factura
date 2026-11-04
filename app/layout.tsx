import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'SaludFactura',
  description: 'Cobro del copago con Factus Pay y facturación electrónica del sector salud con Factus',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="barra">
          <Link href="/" className="marca">
            Salud<span>Factura</span>
          </Link>
          <nav>
            <Link href="/caja">Caja</Link>
            <Link href="/facturacion">Facturación EPS</Link>
            <Link href="/glosas">Glosas</Link>
            <Link href="/cartera">Cartera</Link>
          </nav>
          <span className="sello">Sandbox Factus</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}

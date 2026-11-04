import type { Metadata } from 'next'
import EspacioTrabajo from './components/sesion'
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
        <EspacioTrabajo>{children}</EspacioTrabajo>
      </body>
    </html>
  )
}

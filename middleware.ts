// Protege toda la API propia: sin sesión válida (y sin código de verificación para administradores) no responde.
// Quedan fuera, porque tienen su propia protección:
//  - /webhooks/factus-pay → llave ?key= comparada en tiempo constante (no está bajo /api)
//  - /api/cron/tick       → encabezado Authorization: Bearer <CRON_SECRET>
import { NextResponse, type NextRequest } from 'next/server'
import { verificarSolicitud } from './lib/auth'

export async function middleware(req: NextRequest) {
  const ruta = req.nextUrl.pathname
  if (ruta === '/api/cron/tick') return NextResponse.next()
  const d = await verificarSolicitud(req, ruta)
  if (!d.ok) return NextResponse.json({ error: d.error, codigo: d.codigo }, { status: d.status })
  return NextResponse.next()
}

export const config = { matcher: ['/api/:path*'] }

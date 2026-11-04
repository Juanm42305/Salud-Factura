// Configuración leída de variables de entorno. Se usan getters para leer siempre el valor actual.
function texto(nombre: string, porDefecto = ''): string {
  const v = process.env[nombre]
  return v === undefined || v.trim() === '' ? porDefecto : v.trim()
}

function bandera(nombre: string, porDefecto = false): boolean {
  const v = process.env[nombre]
  if (v === undefined || v.trim() === '') return porDefecto
  return ['1', 'true', 'si', 'sí', 'yes'].includes(v.trim().toLowerCase())
}

function entero(nombre: string): number | null {
  const v = Number(texto(nombre))
  return texto(nombre) && Number.isInteger(v) ? v : null
}

const sinBarra = (u: string) => u.replace(/\/+$/, '')

export const env = {
  // Factus Facturación
  get factusBaseUrl() { return sinBarra(texto('FACTUS_BASE_URL', 'https://api-sandbox.factus.com.co')) },
  get factusClientId() { return texto('FACTUS_CLIENT_ID') },
  get factusClientSecret() { return texto('FACTUS_CLIENT_SECRET') },
  get factusUsername() { return texto('FACTUS_USERNAME') },
  get factusPassword() { return texto('FACTUS_PASSWORD') },
  get factusRangoFacturas() { return entero('FACTUS_NUMBERING_RANGE_ID') },
  get factusRangoNotas() { return entero('FACTUS_CREDIT_NOTE_RANGE_ID') },
  get factusMock() { return bandera('FACTUS_MOCK') },

  // Factus Pay
  get payBaseUrl() { return sinBarra(texto('FACTUS_PAY_BASE_URL', 'https://pay-api-sandbox.factus.com.co')) },
  get payEmail() { return texto('FACTUS_PAY_EMAIL') },
  get payPassword() { return texto('FACTUS_PAY_PASSWORD') },
  get payWebhookKey() { return texto('FACTUS_PAY_WEBHOOK_KEY') },
  get payAccessKey() { return texto('FACTUS_PAY_ACCESS_KEY') },
  get payMock() { return bandera('FACTUS_PAY_MOCK') },

  // IPS
  get ipsProviderCode() { return texto('IPS_PROVIDER_CODE') },
  get ipsNombre() { return texto('IPS_NOMBRE', 'IPS SaludFactura') },
  get cufeDescuentaPrepagos() { return bandera('SS_CUFE_PAGO_DESCUENTA_PREPAGOS', true) },

  // App
  get databaseUrl() { return texto('DATABASE_URL') },
  get appPublicUrl() { return sinBarra(texto('APP_PUBLIC_URL')) },
  get runWorker() { return bandera('RUN_WORKER') },
  get cronSecret() { return texto('CRON_SECRET') },
  get produccion() { return process.env.NODE_ENV === 'production' },
}

/** Avisa si las URLs base apuntan fuera del sandbox (el reto exige solo sandbox). */
export function urlsEnSandbox(): boolean {
  return env.factusBaseUrl.includes('sandbox') && env.payBaseUrl.includes('sandbox')
}

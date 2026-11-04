// Punto único para obtener los clientes de Factus. Elige real o simulado según las variables.
import { env } from '../env'
import { FactusAuthManager } from './factusAuth'
import { FactusClient, type FactusApi } from './factusClient'
import { MockFactusApi } from './factusMock'
import { FactusPayAuth } from './payAuth'
import { FactusPayClient, type PayApi } from './payClient'
import { MockPayApi } from './payMock'
import { DbTokenStore, MemoriaTokenStore, type TokenStore } from './tokenStore'

interface Contenedor {
  store?: TokenStore
  payAuth?: FactusPayAuth
  pay?: PayApi
  factusAuth?: FactusAuthManager
  factus?: FactusApi
}

const g = globalThis as unknown as { __sfApis?: Contenedor }
const c = () => (g.__sfApis ??= {})

function store(): TokenStore {
  return (c().store ??= env.databaseUrl ? new DbTokenStore() : new MemoriaTokenStore())
}

export const configPay = () => ({
  baseUrl: env.payBaseUrl,
  email: env.payEmail,
  password: env.payPassword,
  accessKey: env.payAccessKey,
})

export const configFactus = () => ({
  baseUrl: env.factusBaseUrl,
  clientId: env.factusClientId,
  clientSecret: env.factusClientSecret,
  username: env.factusUsername,
  password: env.factusPassword,
})

export function payAuth(): FactusPayAuth {
  return (c().payAuth ??= new FactusPayAuth(store(), configPay))
}

export function pay(): PayApi {
  return (c().pay ??= env.payMock ? new MockPayApi() : new FactusPayClient(payAuth(), configPay))
}

export function factusAuth(): FactusAuthManager {
  return (c().factusAuth ??= new FactusAuthManager(store(), configFactus))
}

export function factus(): FactusApi {
  return (c().factus ??= env.factusMock ? new MockFactusApi() : new FactusClient(factusAuth(), configFactus))
}

/** Para pruebas: reemplaza los clientes. */
export function setApis(apis: Contenedor) {
  g.__sfApis = { ...apis }
}

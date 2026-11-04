// Candado (mutex) dentro del proceso: evita que dos peticiones simultáneas renueven el mismo token.
const colas = new Map<string, Promise<void>>()

export async function conMutex<T>(nombre: string, fn: () => Promise<T>): Promise<T> {
  const previo = colas.get(nombre) ?? Promise.resolve()
  let liberar!: () => void
  const actual = new Promise<void>((r) => (liberar = r))
  const cadena = previo.then(() => actual)
  colas.set(nombre, cadena)
  await previo
  try {
    return await fn()
  } finally {
    liberar()
    if (colas.get(nombre) === cadena) colas.delete(nombre)
  }
}

export const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

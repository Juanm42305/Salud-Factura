// fetch con tiempo límite y lectura segura del cuerpo (JSON o texto).
export interface RespuestaHttp {
  status: number
  cuerpo: any
}

export async function pedir(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<RespuestaHttp> {
  const { timeoutMs = 30_000, ...resto } = init
  let res: Response
  try {
    res = await fetch(url, { ...resto, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
  } catch (e) {
    // Red caída o tiempo agotado: status 0 para que el llamador decida si reintenta
    return { status: 0, cuerpo: { message: `Sin respuesta: ${(e as Error).message}` } }
  }
  const texto = await res.text()
  let cuerpo: any = texto
  try {
    cuerpo = texto ? JSON.parse(texto) : null
  } catch {
    /* no era JSON */
  }
  return { status: res.status, cuerpo }
}

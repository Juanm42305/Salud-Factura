// Cálculo del copago / cuota moderadora (función pura: la usan el backend y la pantalla de caja).
// cuotas del contrato = {"CUO": {"A": 4700}, "COP": {"A": 0.115}}; un valor < 1 es porcentaje del total.
export function calcularRecaudo(
  cuotas: Record<string, Record<string, number>> | null | undefined,
  concepto: string,
  categoria: string,
  totalServicios: number,
): number {
  const regla = cuotas?.[concepto]?.[categoria]
  if (regla === undefined || regla === null) return 0
  const v = Number(regla)
  if (v > 0 && v < 1) return Math.round((totalServicios * v) / 100) * 100 // porcentaje, redondeado a la centena
  return v
}

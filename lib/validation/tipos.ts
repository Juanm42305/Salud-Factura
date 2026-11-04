export type Nivel = 'error' | 'advertencia'

export interface Hallazgo {
  codigo: string // V01..V20
  nivel: Nivel
  campo: string
  mensaje: string
}

export type TipoValidacion = 'recaudoPay' | 'ssRecaudo' | 'ssCufe' | 'notaCredito'

export interface RecaudoContexto {
  reference_code: string
  estado: string // ready | started | paid | rejected | failed | ...
  monto: number
  facturaReferencia?: string | null // reference_code de su factura SS-Recaudo
  facturaValidada?: boolean
}

/** Lo que el validador necesita saber del sistema además del payload. */
export interface Contexto {
  tipo: TipoValidacion
  /** V02: ya existe otro recaudo con esa referencia y distinto monto/admisión */
  referenciaDuplicada?: boolean
  /** V11: recaudo asociado a la SS-Recaudo */
  recaudo?: { estado: string; monto: number }
  /** V15, V16: todos los recaudos de la atención */
  recaudosAtencion?: RecaudoContexto[]
  /** V17: tarifas pactadas por código */
  tarifasContrato?: Record<string, number>
  /** V03 en SS-CUFE: si payment_details debe ser total − recaudos previos */
  descontarPrepagos?: boolean
  /** V20: saldo vivo de la factura que corrige la nota */
  saldoFactura?: number
}

export type Regla = (payload: any, ctx: Contexto) => Hallazgo[]

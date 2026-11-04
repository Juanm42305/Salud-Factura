import type { HallazgoUI } from './ui'

export type Monto = number | string
export interface Servicio { codigo: string; nombre: string; cantidad: Monto; tarifa: Monto }
export interface Paciente { id: number; nombres: string; apellidos: string; tipo_doc_salud: string; numero_doc: string; categoria: string }
export interface Contrato { id: number; numero: string; eps: string; esquema_recaudo: number; tarifas: Record<string, number>; cuotas: Record<string, Record<string, number>> }
export interface Catalogos { pacientes: Paciente[]; contratos: Contrato[]; servicios: { codigo: string; nombre: string }[] }
export interface AdmisionResumen { id: number; codigo: string; paciente: string; eps: string; estado: string; total_servicios: Monto; monto_recaudo: Monto; created_at: string }
export interface Factura {
  id: number; tipo: string; estado: string; numero: string | null; reference_code: string;
  total: Monto; total_neto: Monto; cufe: string | null; public_url: string | null;
  error_mensaje: string | null; errores_validacion: HallazgoUI[] | null;
  eps?: string; items?: { code_reference: string; name: string; price: Monto; quantity: Monto }[];
}
export interface Recaudo { id: number; reference_code: string; monto: Monto; estado: string; qr: string | null; qr_expira: string | null; breb_key: string | null; origen_confirmacion: string | null; pagado_en: string | null }
export interface Admision {
  id: number; codigo: string; atencion_codigo: string; nombres: string; apellidos: string;
  estado: string; nota_estado: string | null; eps: string; contrato_numero: string;
  modalidad_pago: string; cobertura: string; total_servicios: number; monto_recaudo: Monto;
  servicios: Servicio[]; facturas: Factura[]; recaudos: Recaudo[];
}
export interface Glosa {
  id: number; factura_numero: string; eps: string; tipo: string; motivo: string;
  created_at: string; valor: Monto; estado: string; nota_numero: string | null;
  nota_error: string | null; nota_id: number | null; nota_estado: string | null;
}
export interface CarteraEPS { id: number; razon_social: string; nit: string; facturas: number; servicios: Monto; copagos: Monto; facturado: Monto; glosado: Monto; notas_credito: Monto; saldo: Monto; glosas_abiertas: number }
export interface CarteraDatos { eps: CarteraEPS[]; totales: { facturado: number; copagos: number; glosado: number; saldo: number } }

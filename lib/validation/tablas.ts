// Tablas de referencia de Factus usadas por los builders y el validador.
// Fuente: developers.factus.com.co/tablas-de-referencia/tablas

/** Tipos de documento del sector salud (beneficiary.identification_document_code). */
export const DOCS_SALUD = ['CC', 'CE', 'CD', 'PA', 'SC', 'PE', 'RC', 'TI', 'CN', 'AS', 'MS', 'DE', 'SI', 'PT'] as const
export const DOCS_SALUD_SIN_NUMERO = ['SI', 'MS', 'AS']

/** Documento de salud → tipo de documento DIAN para el adquiriente (customer). */
export const DOC_SALUD_A_DIAN: Record<string, string> = {
  RC: '11',
  CN: '11',
  TI: '12',
  CC: '13',
  CE: '22',
  PA: '41',
  DE: '42',
  PE: '47',
  PT: '48',
}

export const CONCEPTOS_RECAUDO = ['COP', 'CUO', 'PAC'] as const
export type ConceptoRecaudo = (typeof CONCEPTOS_RECAUDO)[number]

export const NOMBRE_CONCEPTO: Record<ConceptoRecaudo, string> = {
  COP: 'Copago',
  CUO: 'Cuota moderadora',
  PAC: 'Pago compartido plan voluntario',
}

/** Conceptos de anticipo o recaudo previo en salud (prepayment_details.concept_code). */
export const CONCEPTO_PREPAGO: Record<ConceptoRecaudo, string> = { COP: '01', CUO: '02', PAC: '03' }

/** Métodos (modalidades) de pago en salud. */
export const METODOS_PAGO_SALUD: Record<string, string> = {
  '01': 'Pago individual por caso / paquete / canasta',
  '02': 'Pago global prospectivo',
  '03': 'Pago por capitación',
  '04': 'Pago por evento',
}

/** Planes de cobertura en salud. */
export const COBERTURAS: Record<string, string> = {
  '01': 'PBS financiado con UPC',
  '02': 'Presupuesto máximo',
  '03': 'Prima EPS / EOC, no asegurados SOAT',
  '04': 'Cobertura Póliza SOAT',
  '05': 'Cobertura ARL',
  '06': 'Cobertura ADRES',
  '07': 'Cobertura Salud Pública',
  '08': 'Entidad territorial, recursos de oferta',
  '09': 'Urgencias población migrante',
  '10': 'Plan complementario en salud',
  '11': 'Plan medicina prepagada',
  '12': 'Otras pólizas en salud',
  '13': 'Régimen Especial o Excepción',
  '14': 'Fondo Nacional de Salud PPL',
  '15': 'Particular',
  '16': 'PBS con UPC régimen contributivo',
  '17': 'PBS con UPC régimen subsidiado',
}
export const COBERTURAS_CON_POLIZA = ['04', '05']

/** Causales de factura sin contrato (health.without_contract_code). */
export const CAUSALES_SIN_CONTRATO: Record<string, string> = {
  '01': 'Atención de urgencias',
  '02': 'Atención a cargo de ADRES o aseguradora SOAT, planes voluntarios',
  '03': 'Fallos de tutela / órdenes judiciales',
  '04': 'Portabilidad o asignación masiva de afiliados',
  '05': 'Casos excepcionales sin contrato',
  '06': 'Recuperación de órganos para trasplante',
  '07': 'Atención a pacientes particulares',
}

/** Códigos de corrección de nota crédito. */
export const CONCEPTO_CORRECCION = {
  servicio_no_aceptado: '1',
  factura_rechazada: '2',
  descuento_pactado: '3',
  diferencia_tarifa: '4',
} as const
export type TipoGlosa = keyof typeof CONCEPTO_CORRECCION

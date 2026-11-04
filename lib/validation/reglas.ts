// Motor de validación previa: reglas V01–V20 como funciones puras regla(payload, contexto) → hallazgos.
import { dvNit, totalItems } from '../builders/comun'
import {
  CONCEPTOS_RECAUDO,
  COBERTURAS,
  COBERTURAS_CON_POLIZA,
  DOCS_SALUD,
  DOCS_SALUD_SIN_NUMERO,
  METODOS_PAGO_SALUD,
} from './tablas'
import type { Hallazgo, Nivel, Regla } from './tipos'

const h = (codigo: string, campo: string, mensaje: string, nivel: Nivel = 'error'): Hallazgo => ({ codigo, nivel, campo, mensaje })
const num = (v: unknown) => Number(v ?? 0)
const vacio = (v: unknown) => v === undefined || v === null || String(v).trim() === ''
const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`
const TOLERANCIA_REDONDEO = 500

// ── Recaudo Factus Pay ─────────────────────────────────────────
export const V01: Regla = (p) => {
  const monto = num(p.amount)
  // Confirmado en el sandbox: Factus Pay exige mínimo $10.000 (su documentación dice $1.000)
  const minimo = Number(process.env.FACTUS_PAY_MONTO_MINIMO ?? 10000)
  if (!Number.isFinite(monto) || monto < minimo || monto > 12_100_000)
    return [h('V01', 'amount', `El monto ${pesos(monto)} debe estar entre ${pesos(minimo)} y $12.100.000 para cobrarse por QR`)]
  if (!/^\d+(\.\d{1,2})?$/.test(String(p.amount)))
    return [h('V01', 'amount', 'El monto admite máximo 2 decimales')]
  return []
}

export const V02: Regla = (p, ctx) => {
  const ref = String(p.reference_code ?? '')
  const out: Hallazgo[] = []
  if (!ref) out.push(h('V02', 'reference_code', 'Falta reference_code'))
  else if (ref.length > 100) out.push(h('V02', 'reference_code', `reference_code tiene ${ref.length} caracteres (máximo 100)`))
  if (ctx.referenciaDuplicada) out.push(h('V02', 'reference_code', `La referencia ${ref} ya se usó en otro recaudo`))
  return out
}

// ── Todas las facturas ─────────────────────────────────────────
/** Total que debe sumar payment_details. */
export function totalEsperado(p: any, ctx: { tipo: string; descontarPrepagos?: boolean }): number {
  const total = totalItems(p.items ?? [])
  if (ctx.tipo === 'ssCufe' && ctx.descontarPrepagos) {
    const previos = (p.prepayment_details ?? []).reduce((s: number, x: any) => s + num(x.amount), 0)
    return total - previos
  }
  return total
}

export const V03: Regla = (p, ctx) => {
  const pagos = (p.payment_details ?? []) as any[]
  if (!pagos.length) return [h('V03', 'payment_details', 'Falta payment_details')]
  const suma = pagos.reduce((s, x) => s + num(x.amount), 0)
  const esperado = totalEsperado(p, ctx)
  if (Math.abs(suma - esperado) > TOLERANCIA_REDONDEO)
    return [h('V03', 'payment_details', `Los pagos suman ${pesos(suma)} y el total calculado es ${pesos(esperado)}`)]
  return []
}

export const V04: Regla = (p) => {
  const c = p.customer
  if (!c) return []
  if (String(c.legal_organization_code) === '2' && vacio(c.names))
    return [h('V04', 'customer.names', 'Cliente persona natural (legal_organization_code 2) requiere names')]
  if (String(c.legal_organization_code) === '1' && vacio(c.company))
    return [h('V04', 'customer.company', 'Cliente persona jurídica (legal_organization_code 1) requiere company')]
  if (!['1', '2'].includes(String(c.legal_organization_code)))
    return [h('V04', 'customer.legal_organization_code', 'legal_organization_code debe ser 1 (jurídica) o 2 (natural)')]
  return []
}

export const V05: Regla = (p) => {
  const c = p.customer
  if (!c || String(c.identification_document_code) !== '31') return []
  const id = String(c.identification ?? '')
  if (!/^\d+$/.test(id))
    return [h('V05', 'customer.identification', `El NIT "${id}" debe ir solo con números, sin puntos, guion ni DV`)]
  // NIT de 10 dígitos cuyo último dígito es el DV de los 9 primeros: lo pegaron al NIT
  const sinUltimo = id.slice(0, -1)
  if (id.length === 10 && dvNit(sinUltimo) === id.slice(-1))
    return [h('V05', 'customer.identification', `El NIT parece incluir el DV al final (${sinUltimo}-${id.slice(-1)}): envía ${sinUltimo} y el DV en dv`)]
  if (vacio(c.dv)) return [h('V05', 'customer.dv', 'Falta el dígito de verificación del NIT en el campo dv')]
  if (dvNit(id) !== String(c.dv))
    return [h('V05', 'customer.dv', `El DV ${c.dv} no corresponde al NIT ${id} (debería ser ${dvNit(id)})`)]
  return []
}

export const V06: Regla = (p) =>
  ((p.payment_details ?? []) as any[]).flatMap((x, i) =>
    String(x.payment_form) === '2' && vacio(x.due_date)
      ? [h('V06', `payment_details[${i}].due_date`, 'Pago a crédito (payment_form 2) exige due_date')]
      : [],
  )

export const V18: Regla = (p) =>
  String(p.observation ?? '').length > 500
    ? [h('V18', 'observation', `observation tiene ${String(p.observation).length} caracteres (máximo 500)`)]
    : []

const dosDecimales = (v: unknown) => /^-?\d+(\.\d{1,2})?$/.test(String(v))

export const V19: Regla = (p) =>
  ((p.items ?? []) as any[]).flatMap((it, i) => {
    const out: Hallazgo[] = []
    if (!dosDecimales(it.price)) out.push(h('V19', `items[${i}].price`, `Precio "${it.price}" con más de 2 decimales o inválido`))
    if (!dosDecimales(it.quantity)) out.push(h('V19', `items[${i}].quantity`, `Cantidad "${it.quantity}" con más de 2 decimales o inválida`))
    return out
  })

// ── SS-Recaudo ─────────────────────────────────────────────────
export const V07: Regla = (p) => {
  const b = p.beneficiary
  if (!b) return [h('V07', 'beneficiary', 'La factura SS-Recaudo exige beneficiary (paciente atendido)')]
  if (!DOCS_SALUD.includes(b.identification_document_code))
    return [h('V07', 'beneficiary.identification_document_code', `"${b.identification_document_code}" no es un tipo de documento del sector salud`)]
  return []
}

export const V08: Regla = (p) => {
  const b = p.beneficiary
  if (!b || DOCS_SALUD_SIN_NUMERO.includes(b.identification_document_code)) return []
  return vacio(b.identification_number)
    ? [h('V08', 'beneficiary.identification_number', 'Falta el número de documento del paciente')]
    : []
}

export const V09: Regla = (p) =>
  ((p.items ?? []) as any[]).flatMap((it, i) => {
    const out: Hallazgo[] = []
    if (![0, 1].includes(Number(it.scheme_id)) || vacio(it.scheme_id))
      out.push(h('V09', `items[${i}].scheme_id`, 'Cada ítem SS-Recaudo requiere scheme_id 0 (propio) o 1 (terceros)'))
    if (!CONCEPTOS_RECAUDO.includes(it.collection_concept_code))
      out.push(h('V09', `items[${i}].collection_concept_code`, 'collection_concept_code debe ser COP, CUO o PAC'))
    return out
  })

export const V10: Regla = (p) =>
  ((p.items ?? []) as any[]).flatMap((it, i) =>
    Number(it.scheme_id) === 1 && (vacio(it.mandate?.identification) || vacio(it.mandate?.identification_document_code))
      ? [h('V10', `items[${i}].mandate`, 'Ingreso para terceros (scheme_id 1) exige mandate con el NIT de la EPS')]
      : [],
  )

export const V11: Regla = (p, ctx) => {
  if (!ctx.recaudo) return [h('V11', 'recaudo', 'No hay recaudo Factus Pay asociado a esta factura')]
  if (ctx.recaudo.estado !== 'paid')
    return [h('V11', 'recaudo', `El recaudo está "${ctx.recaudo.estado}", no pagado: no se factura un copago sin pago confirmado`)]
  const total = totalItems(p.items ?? [])
  if (Math.abs(total - ctx.recaudo.monto) > 0.01)
    return [h('V11', 'items', `La factura suma ${pesos(total)} y el recaudo pagado es ${pesos(ctx.recaudo.monto)}`)]
  return []
}

// ── SS-CUFE ────────────────────────────────────────────────────
export const V12: Regla = (p) => {
  const s = p.health
  if (!s) return [h('V12', 'health', 'La factura SS-CUFE exige el objeto health')]
  const out: Hallazgo[] = []
  if (vacio(s.provider_code)) out.push(h('V12', 'health.provider_code', 'Falta el código de habilitación de la IPS (IPS_PROVIDER_CODE)'))
  else if (String(s.provider_code).length > 10)
    out.push(h('V12', 'health.provider_code', `El código de prestador tiene ${String(s.provider_code).length} caracteres; Factus admite máximo 10`))
  if (!METODOS_PAGO_SALUD[s.payment_method_code])
    out.push(h('V12', 'health.payment_method_code', `Modalidad de pago en salud "${s.payment_method_code ?? ''}" no existe en la tabla`))
  if (!COBERTURAS[s.coverage_code])
    out.push(h('V12', 'health.coverage_code', `Plan de cobertura "${s.coverage_code ?? ''}" no existe en la tabla`))
  return out
}

/** Aprendida en el sandbox: Factus rechaza la SS-CUFE sin periodo de facturación. */
export const V21: Regla = (p) => {
  const b = p.billing_period
  if (!b || vacio(b.start_date) || vacio(b.end_date))
    return [h('V21', 'billing_period', 'La factura SS-CUFE exige billing_period (inicio y fin de la atención)')]
  if (`${b.end_date} ${b.end_time ?? ''}` < `${b.start_date} ${b.start_time ?? ''}`)
    return [h('V21', 'billing_period', 'El fin del periodo de facturación es anterior al inicio')]
  return []
}

export const V13: Regla = (p) => {
  const s = p.health ?? {}
  return vacio(s.contract_number) && vacio(s.without_contract_code)
    ? [h('V13', 'health.contract_number', 'Falta el contrato con la EPS: envía contract_number o la causal without_contract_code')]
    : []
}

export const V14: Regla = (p) => {
  const s = p.health ?? {}
  return COBERTURAS_CON_POLIZA.includes(s.coverage_code) && vacio(s.policy_number)
    ? [h('V14', 'health.policy_number', `Cobertura ${COBERTURAS[s.coverage_code]} exige policy_number`)]
    : []
}

export const V15: Regla = (p, ctx) => {
  const previos = (p.prepayment_details ?? []) as any[]
  const out: Hallazgo[] = []
  for (const r of (ctx.recaudosAtencion ?? []).filter((x) => x.estado === 'paid')) {
    const ref = r.facturaReferencia
    const linea = previos.find((x) => x.reference_code === ref)
    if (!ref || !r.facturaValidada)
      out.push(h('V15', 'prepayment_details', `El copago ${r.reference_code} está pagado pero su factura SS-Recaudo no está validada`))
    else if (!linea)
      out.push(h('V15', 'prepayment_details', `Falta descontar el copago ${r.reference_code} (factura ${ref}) en prepayment_details`))
    else if (vacio(linea.concept_code))
      out.push(h('V15', 'prepayment_details.concept_code', `El recaudo previo ${ref} no trae concept_code`))
  }
  previos.forEach((x, i) => {
    if (vacio(x.concept_code) && !out.some((o) => o.campo.endsWith('concept_code')))
      out.push(h('V15', `prepayment_details[${i}].concept_code`, 'Cada recaudo previo requiere concept_code en SS-CUFE'))
  })
  return out
}

export const V16: Regla = (_p, ctx) =>
  (ctx.recaudosAtencion ?? [])
    .filter((r) => r.estado === 'ready' || r.estado === 'started' || r.estado === 'creado')
    .map((r) => h('V16', 'recaudos', `El copago ${r.reference_code} sigue pendiente de pago: no se factura a la EPS hasta resolverlo`))

export const V17: Regla = (p, ctx) => {
  if (!ctx.tarifasContrato) return []
  return ((p.items ?? []) as any[]).flatMap((it, i) => {
    const pactada = ctx.tarifasContrato![it.code_reference]
    if (pactada === undefined)
      return [h('V17', `items[${i}].code_reference`, `El servicio ${it.code_reference} no tiene tarifa en el contrato`, 'advertencia')]
    return Math.abs(num(it.price) - pactada) > 0.01
      ? [h('V17', `items[${i}].price`, `Tarifa ${pesos(num(it.price))} distinta a la pactada ${pesos(pactada)}: riesgo de glosa`, 'advertencia')]
      : []
  })
}

// ── Nota crédito ───────────────────────────────────────────────
export const V20: Regla = (p, ctx) => {
  const total = totalItems(p.items ?? [])
  if (ctx.saldoFactura === undefined) return []
  return total - ctx.saldoFactura > 0.01
    ? [h('V20', 'items', `La nota (${pesos(total)}) supera el saldo de la factura (${pesos(ctx.saldoFactura)})`)]
    : []
}

const COMUNES = [V03, V04, V05, V06, V18, V19]

export const REGLAS: Record<string, Regla[]> = {
  recaudoPay: [V01, V02],
  ssRecaudo: [...COMUNES, V07, V08, V09, V10, V11],
  ssCufe: [...COMUNES, V12, V13, V14, V15, V16, V17, V21],
  notaCredito: [...COMUNES, V20],
}
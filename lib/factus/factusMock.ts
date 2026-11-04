// Factus Facturación simulado (FACTUS_MOCK=true): solo para maquetar pantallas sin credenciales.
// La demo ante el jurado debe correr con FACTUS_MOCK=false (integración real o descalificación).
import { createHash } from 'node:crypto'
import type { DocumentoFactus, EventoRadian, FactusApi, ResultadoEmision, TipoDocumento } from './factusClient'

const g = globalThis as unknown as { __sfFactusMock?: { n: number; docs: Map<string, DocumentoFactus> } }
const estado = () => (g.__sfFactusMock ??= { n: 0, docs: new Map() })

function pdfMinimo(texto: string): string {
  const linea = texto.replace(/[()\\]/g, '')
  const stream = `BT /F1 18 Tf 72 720 Td (${linea}) Tj ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf).toString('base64')
}

export class MockFactusApi implements FactusApi {
  readonly modo = 'mock' as const

  private emitir(prefijo: string, payload: Record<string, any>): ResultadoEmision {
    const ref = String(payload.reference_code)
    const previo = estado().docs.get(ref)
    if (previo) return { ok: true, doc: previo, via: 'existente' }
    const n = ++estado().n
    const total = (payload.items ?? []).reduce(
      (s: number, i: any) => s + Number(i.price) * Number(i.quantity) * (1 - Number(i.discount_rate ?? 0) / 100),
      0,
    )
    const doc: DocumentoFactus = {
      id: String(n),
      numero: `${prefijo}${990000000 + n}`,
      cufe: createHash('sha384').update(ref).digest('hex'),
      is_validated: true,
      public_url: null,
      qr: null,
      total,
      errores: null,
      raw: { mock: true },
    }
    estado().docs.set(ref, doc)
    return { ok: true, doc, via: 'creada' }
  }

  async validarFactura(payload: Record<string, any>) {
    return this.emitir('SETP', payload)
  }

  async validarNotaCredito(payload: Record<string, any>) {
    return this.emitir('NC', payload)
  }

  async descargar(_tipo: TipoDocumento, numero: string, formato: 'pdf' | 'xml') {
    if (formato === 'pdf') return { nombre: `${numero}.pdf`, base64: pdfMinimo(`Documento simulado ${numero} - NO VALIDO DIAN`) }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Mock numero="${numero}">Documento simulado, no válido ante la DIAN</Mock>`
    return { nombre: `${numero}.xml`, base64: Buffer.from(xml).toString('base64') }
  }

  async eventosRadian(_numero: string): Promise<EventoRadian[]> {
    return []
  }

  async rangosNumeracion() {
    return [{ id: 0, document: 'Factura de Venta (mock)', prefix: 'SETP', is_active: 1 }]
  }
}

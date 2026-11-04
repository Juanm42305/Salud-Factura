// Admisiones de respaldo para la demo (sección 14.2 de la especificación).
// Deja UNA admisión en estado "creada" por escenario, lista para cobrar en vivo, así no se teclea frente al jurado.
// Usa el mismo servicio crearAdmision de la app: el copago y el código (con REFERENCIA_EQUIPO) salen igual.
// Solo crea admisiones: el cobro (Factus Pay) y las facturas (Factus) se hacen en vivo con las APIs reales.
//
// Uso:  npm run db:demo            (crea las que falten y muestra la tabla)
//       npm run db:demo -- --ver   (solo muestra la tabla)
// Requiere haber corrido antes: npm run db:migrar
import { db } from '../lib/db'
import { crearAdmision } from '../lib/services/admisiones'

type Concepto = 'CUO' | 'COP' | 'PAC'

interface Escenario {
  etiqueta: string
  paso: string
  paciente: { tipo: string; numero: string }
  contrato: string
  concepto: Concepto
  servicios: { codigo: string; cantidad?: number }[]
}

// Pacientes, EPS y contratos son los ficticios de db/seed.sql
const ESCENARIOS: Escenario[] = [
  {
    etiqueta: 'DEMO-1 pitch principal',
    paso: 'Minutos 1:00-3:30: cobro, pago exitoso, SS-Recaudo y SS-CUFE',
    paciente: { tipo: 'CC', numero: '1234567890' }, // Ana María Pérez, categoría A
    contrato: 'CTO-EPS-2026-045',
    concepto: 'CUO',
    servicios: [{ codigo: '890201' }, { codigo: '902210' }],
  },
  {
    etiqueta: 'DEMO-2 pago fallido',
    paso: 'Pago rechazado en el simulador: no debe generar factura',
    paciente: { tipo: 'CC', numero: '1098765432' }, // Carlos Ruiz, categoría B
    contrato: 'CTO-EPS-2026-045',
    concepto: 'CUO',
    servicios: [{ codigo: '890301' }],
  },
  {
    etiqueta: 'DEMO-3 copago porcentual',
    paso: 'Copago COP (porcentaje del total) con varios servicios',
    paciente: { tipo: 'CE', numero: '456789' }, // Lucía Fernández, categoría C
    contrato: 'CTO-EPS-2026-045',
    concepto: 'COP',
    servicios: [{ codigo: '890201' }, { codigo: '871121' }],
  },
  {
    etiqueta: 'DEMO-4 ingreso para terceros',
    paso: 'Contrato con esquema_recaudo 1: la SS-Recaudo lleva mandate (sección 7.4)',
    paciente: { tipo: 'TI', numero: '1067000111' }, // Sofía Martínez, categoría A
    contrato: 'CTO-EPS-2026-077',
    concepto: 'CUO',
    servicios: [{ codigo: '890201' }],
  },
]

async function preparar() {
  for (const e of ESCENARIOS) {
    const lista = await db.q1(
      `select a.id, a.codigo from admisiones a where a.estado = 'creada' and a.nota_estado = $1 order by a.id limit 1`,
      [e.etiqueta],
    )
    if (lista) {
      console.log(`= ${e.etiqueta}: ya hay una lista (${lista.codigo})`)
      continue
    }
    const paciente = await db.q1(`select id from pacientes where tipo_doc_salud = $1 and numero_doc = $2`, [
      e.paciente.tipo,
      e.paciente.numero,
    ])
    const contrato = await db.q1(`select id from contratos where numero = $1`, [e.contrato])
    if (!paciente || !contrato) throw new Error(`Faltan datos base para "${e.etiqueta}": corre primero npm run db:migrar`)

    const adm = await crearAdmision({
      paciente_id: paciente.id,
      contrato_id: contrato.id,
      concepto: e.concepto,
      servicios: e.servicios,
    })
    await db.q(`update admisiones set nota_estado = $1 where id = $2`, [e.etiqueta, adm.id])
    console.log(`+ ${e.etiqueta}: creada ${adm.codigo} (recaudo ${adm.concepto} $${adm.monto_recaudo})`)
  }
}

async function mostrar() {
  const filas = await db.q(
    `select a.id, a.codigo, a.nota_estado as escenario, a.concepto_recaudo as concepto, a.monto_recaudo as recaudo,
        p.nombres || ' ' || p.apellidos as paciente, e.razon_social as eps
     from admisiones a
     join pacientes p on p.id = a.paciente_id
     join contratos c on c.id = a.contrato_id
     join eps e on e.id = c.eps_id
     where a.estado = 'creada' and a.nota_estado like 'DEMO-%'
     order by a.nota_estado, a.id`,
  )
  console.log('\nAdmisiones de respaldo listas para cobrar:')
  console.table(filas)
  for (const e of ESCENARIOS) console.log(`  ${e.etiqueta}: ${e.paso}`)
}

async function main() {
  if (!process.argv.includes('--ver')) await preparar()
  await mostrar()
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('Error:', (e as Error).message)
    process.exit(1)
  },
)

// Panel de cartera por EPS: facturado, copagos recaudados, glosado, notas crédito y saldo.
import { db } from '../db'

export async function carteraPorEps() {
  const filas = await db.q(
    `with f as (
       select f.id, c.eps_id, f.total, f.total_neto,
         coalesce((select sum(n.total) from notas_credito n where n.factura_id = f.id and n.estado = 'validada'), 0) as notas
       from facturas f
       join admisiones a on a.id = f.admision_id
       join contratos c on c.id = a.contrato_id
       where f.tipo = 'SS-CUFE' and f.estado = 'validada'
     ),
     cop as (
       select c.eps_id, sum(f.total) as recaudado
       from facturas f join admisiones a on a.id = f.admision_id join contratos c on c.id = a.contrato_id
       where f.tipo = 'SS-Recaudo' and f.estado = 'validada'
       group by c.eps_id
     ),
     gl as (
       select c.eps_id,
         coalesce(sum(g.valor) filter (where g.estado <> 'respondida'), 0) as glosado,
         count(*) filter (where g.estado in ('registrada', 'aceptada')) as abiertas
       from glosas g
       join facturas f on f.id = g.factura_id
       join admisiones a on a.id = f.admision_id
       join contratos c on c.id = a.contrato_id
       group by c.eps_id
     )
     select e.id, e.razon_social, e.nit,
       count(f.id)::int as facturas,
       coalesce(sum(f.total), 0) as servicios,
       coalesce(sum(f.total_neto), 0) as facturado,
       coalesce(max(cop.recaudado), 0) as copagos,
       coalesce(max(gl.glosado), 0) as glosado,
       coalesce(max(gl.abiertas), 0)::int as glosas_abiertas,
       coalesce(sum(f.notas), 0) as notas_credito,
       coalesce(sum(greatest(f.total_neto - f.notas, 0)), 0) as saldo
     from eps e
     left join f on f.eps_id = e.id
     left join cop on cop.eps_id = e.id
     left join gl on gl.eps_id = e.id
     group by e.id, e.razon_social, e.nit
     order by e.razon_social`,
  )
  const n = (x: unknown) => Number(x ?? 0)
  const totales = filas.reduce(
    (t, f) => ({
      facturado: t.facturado + n(f.facturado),
      copagos: t.copagos + n(f.copagos),
      glosado: t.glosado + n(f.glosado),
      notas_credito: t.notas_credito + n(f.notas_credito),
      saldo: t.saldo + n(f.saldo),
    }),
    { facturado: 0, copagos: 0, glosado: 0, notas_credito: 0, saldo: 0 },
  )
  return { eps: filas, totales }
}

-- Datos ficticios para la demo (pacientes, EPS y valores son inventados).
-- Las tarifas y cuotas son de demostración: los valores reales salen del contrato y la norma vigente.

insert into servicios (codigo, nombre) values
  ('890201', 'Consulta de primera vez por medicina general'),
  ('890301', 'Consulta de control o de seguimiento por medicina general'),
  ('902210', 'Hemograma IV (método automático)'),
  ('903841', 'Glucosa en suero u otro fluido diferente a orina'),
  ('871121', 'Radiografía de tórax (PA o AP y lateral)')
on conflict (codigo) do update set nombre = excluded.nombre;

insert into eps (nit, dv, razon_social, email_radicacion, municipio_codigo) values
  ('900123456', '8', 'EPS Andina Salud S.A.S. (ficticia)', 'radicacion@eps-andina.test', '11001'),
  ('800654321', '8', 'EPS Caribe Vital S.A. (ficticia)', 'cuentasmedicas@eps-caribe.test', '08001')
on conflict (nit) do update set razon_social = excluded.razon_social;

insert into contratos (eps_id, numero, modalidad_pago, cobertura, plazo_dias, metodo_pago, esquema_recaudo, tarifas, cuotas)
select e.id, 'CTO-EPS-2026-045', '04', '16', 30, '47', 0,
  '{"890201": 45000, "890301": 38000, "902210": 18500, "903841": 9800, "871121": 62000}',
   '{"CUO": {"A": 10000, "B": 18800, "C": 49400}, "COP": {"A": 0.115, "B": 0.173, "C": 0.23}}'
from eps e where e.nit = '900123456'
on conflict (numero) do update set cuotas = excluded.cuotas;

insert into contratos (eps_id, numero, modalidad_pago, cobertura, plazo_dias, metodo_pago, esquema_recaudo, tarifas, cuotas)
select e.id, 'CTO-EPS-2026-077', '04', '17', 45, '47', 1,
  '{"890201": 42000, "890301": 35000, "902210": 17000, "903841": 9000}',
   '{"CUO": {"A": 10000, "B": 10000, "C": 10000}, "COP": {"A": 0.10, "B": 0.10, "C": 0.10}}'
from eps e where e.nit = '800654321'
on conflict (numero) do update set cuotas = excluded.cuotas;

insert into pacientes (tipo_doc_salud, numero_doc, nombres, apellidos, email, telefono, direccion, municipio_codigo, categoria) values
  ('CC', '1234567890', 'Ana María', 'Pérez Gómez', 'ana.perez@correo.test', '3000000000', 'Calle 1 # 1-1', '23001', 'A'),
  ('CC', '1098765432', 'Carlos Andrés', 'Ruiz Díaz', 'carlos.ruiz@correo.test', '3011111111', 'Carrera 5 # 10-20', '23001', 'B'),
  ('TI', '1067000111', 'Sofía', 'Martínez López', 'acudiente.sofia@correo.test', '3022222222', 'Calle 30 # 8-15', '23001', 'A'),
  ('CE', '456789', 'Lucía', 'Fernández Rojas', 'lucia.fernandez@correo.test', '3033333333', 'Avenida 1 # 2-3', '23001', 'C')
on conflict (tipo_doc_salud, numero_doc) do nothing;

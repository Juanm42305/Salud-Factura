-- SaludFactura · esquema PostgreSQL
-- Se puede correr varias veces (idempotente). En Supabase: SQL Editor → pegar y ejecutar.

create table if not exists servicios (
  codigo text primary key,             -- código CUPS
  nombre text not null
);

create table if not exists pacientes (
  id serial primary key,
  tipo_doc_salud text not null,        -- CC, TI, RC, CE, PA, PT, SI, MS, AS...
  numero_doc text,
  nombres text not null,
  apellidos text not null,
  email text,
  telefono text,
  direccion text,
  municipio_codigo text not null default '23001',
  categoria text not null default 'A' check (categoria in ('A', 'B', 'C')),
  created_at timestamptz not null default now(),
  unique (tipo_doc_salud, numero_doc)
);

create table if not exists eps (
  id serial primary key,
  nit text not null unique,            -- sin dígito de verificación
  dv text not null,
  razon_social text not null,
  email_radicacion text,
  municipio_codigo text not null default '11001'
);

create table if not exists contratos (
  id serial primary key,
  eps_id int not null references eps(id),
  numero text not null unique,
  modalidad_pago text not null,        -- tabla "Métodos de pago en salud": 01..04
  cobertura text not null,             -- tabla "Planes de cobertura en salud": 01..17
  plazo_dias int not null default 30,
  metodo_pago text not null default '47',
  esquema_recaudo int not null default 0 check (esquema_recaudo in (0, 1)), -- 0 ingreso propio, 1 para terceros (mandato)
  tarifas jsonb not null default '{}', -- {"890201": 45000}
  cuotas jsonb not null default '{}',  -- {"CUO": {"A": 4700}, "COP": {"A": 0.115}}
  activo boolean not null default true
);

create table if not exists admisiones (
  id serial primary key,
  codigo text unique,                  -- ADM-2026-000123
  paciente_id int not null references pacientes(id),
  contrato_id int not null references contratos(id),
  concepto_recaudo text not null default 'CUO' check (concepto_recaudo in ('COP', 'CUO', 'PAC')),
  monto_recaudo numeric(14, 2) not null default 0,
  estado text not null default 'creada' check (estado in (
    'creada', 'cobro_pendiente', 'pagada', 'copago_facturado', 'atencion_cerrada',
    'facturada_eps', 'glosada', 'pagada_eps',
    'cobro_fallido', 'cobro_vencido', 'requiere_revision')),
  nota_estado text,
  fecha date not null default current_date,
  cerrada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admisiones_estado_idx on admisiones (estado);

create table if not exists admision_servicios (
  id serial primary key,
  admision_id int not null references admisiones(id) on delete cascade,
  codigo text not null references servicios(codigo),
  nombre text not null,
  cantidad numeric(10, 2) not null default 1,
  tarifa numeric(14, 2) not null
);

create table if not exists recaudos (
  id serial primary key,
  reference_code text not null unique,  -- ADM-2026-000123-COP
  admision_id int not null references admisiones(id),
  concepto text not null check (concepto in ('COP', 'CUO', 'PAC')),
  intento int not null default 1,
  monto numeric(14, 2) not null,
  estado text not null default 'creado' check (estado in (
    'creado', 'ready', 'started', 'paid', 'rejected', 'failed', 'revision')),
  breb_key text,
  qr text,
  qr_expira timestamptz,
  pagado_en timestamptz,
  pagador jsonb,                       -- solo nombre y tipo de documento; número enmascarado
  origen_confirmacion text,            -- webhook | polling
  ultima_consulta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recaudos_estado_idx on recaudos (estado, created_at);

create table if not exists facturas (
  id serial primary key,
  reference_code text not null unique,  -- FV-ADM-...-COP | FV-ATN-...-EPS
  tipo text not null check (tipo in ('SS-Recaudo', 'SS-CUFE')),
  admision_id int not null references admisiones(id),
  recaudo_id int references recaudos(id),
  factus_id text,
  numero text,
  cufe text,
  is_validated boolean not null default false,
  estado text not null default 'pendiente' check (estado in (
    'pendiente', 'bloqueada', 'enviando', 'validada', 'rechazada', 'error', 'requiere_revision')),
  total numeric(14, 2),                 -- valor de los servicios
  total_neto numeric(14, 2),            -- lo que se cobra en payment_details
  public_url text,
  qr_url text,
  payload jsonb,
  respuesta jsonb,
  errores_validacion jsonb,
  error_mensaje text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists factura_recaudos (
  factura_id int not null references facturas(id),
  recaudo_id int not null references recaudos(id),
  primary key (factura_id, recaudo_id)
);

create table if not exists glosas (
  id serial primary key,
  factura_id int not null references facturas(id),
  consecutivo int not null,
  item text,                            -- code_reference del ítem glosado
  valor numeric(14, 2) not null check (valor > 0),
  motivo text not null,
  tipo text not null check (tipo in ('servicio_no_aceptado', 'factura_rechazada', 'diferencia_tarifa', 'descuento_pactado')),
  estado text not null default 'registrada' check (estado in ('registrada', 'respondida', 'aceptada', 'cerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (factura_id, consecutivo)
);

create table if not exists notas_credito (
  id serial primary key,
  reference_code text not null unique,  -- NC-FV-ATN-...-EPS-01
  glosa_id int not null unique references glosas(id),
  factura_id int not null references facturas(id),
  concepto_correccion text not null,
  factus_id text,
  numero text,
  cude text,
  is_validated boolean not null default false,
  estado text not null default 'pendiente' check (estado in (
    'pendiente', 'bloqueada', 'enviando', 'validada', 'rechazada', 'error', 'requiere_revision')),
  total numeric(14, 2),
  public_url text,
  qr_url text,
  payload jsonb,
  respuesta jsonb,
  errores_validacion jsonb,
  error_mensaje text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id bigserial primary key,
  recibido_en timestamptz not null default now(),
  reference_code text,
  cuerpo jsonb,
  resultado text
);

create table if not exists jobs (
  id bigserial primary key,
  tipo text not null,
  clave text not null,
  payload jsonb not null default '{}',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'procesando', 'hecho', 'error')),
  intentos int not null default 0,
  proximo_intento timestamptz not null default now(),
  ultimo_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo, clave)
);
create index if not exists jobs_pendientes_idx on jobs (estado, proximo_intento);

-- Tokens compartidos entre instancias (Factus Pay permite un solo token activo por usuario)
create table if not exists api_tokens (
  api text primary key,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Supabase expone las tablas por su API REST: con RLS activo y sin políticas, nadie con la
-- llave anon puede leerlas. El backend se conecta con DATABASE_URL (rol postgres) y no se ve afectado.
do $$
declare t text;
begin
  foreach t in array array['servicios','pacientes','eps','contratos','admisiones','admision_servicios',
    'recaudos','facturas','factura_recaudos','glosas','notas_credito','webhook_events','jobs','api_tokens']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

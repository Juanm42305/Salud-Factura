# SaludFactura

**Problema.** En las IPS, el cobro en caja y la facturación viven en sistemas distintos: hay copagos cobrados que nunca se facturan y copagos que no se descuentan en la factura a la EPS. Esos errores terminan en glosas.

**Solución.** SaludFactura cobra el copago con **Factus Pay** (QR Bre-B). Cuando el pago se confirma, emite sola la factura electrónica **SS-Recaudo** con **Factus Facturación**. Al cerrar la atención, emite la factura **SS-CUFE** a la EPS descontando lo que ya se recaudó. Si la EPS glosa, genera la nota crédito. Todo queda unido por un mismo `reference_code`.

## Integrantes

| Integrante | Rol | Responsable de |
|---|---|---|
| _(nombre)_ | Integración Factus Pay | Cliente Pay, auth, webhook, polling, simulador |
| _(nombre)_ | Integración Factus Facturación | Cliente Factus, OAuth2, builders SS-Recaudo/SS-CUFE, 409, PDF/XML |
| _(nombre)_ | Backend y validador | Base de datos, estados, cola, reglas V01–V20, nota crédito |
| _(nombre)_ | Frontend y pitch | Pantallas, README, video, diapositivas |

## Arquitectura

```
Frontend (React + Vite) ──► Backend propio (Node + Express + TS) ──► Factus Pay      (recaudo QR + webhook)
                                    │                            └─► Factus Facturación (SS-Recaudo, SS-CUFE, notas crédito)
                                    └─► PostgreSQL (admisiones, recaudos, facturas, webhook_events, jobs)
```

El frontend nunca llama a Factus ni ve credenciales. Ver [docs/integracion.md](docs/integracion.md).

## Estructura

```
backend/src/
  config/      variables de entorno
  clients/     HTTP a Factus Facturación y Factus Pay
  auth/        gestores de token (OAuth2 + refresh / token único Pay)
  builders/    payloads SS-Recaudo, SS-CUFE, nota crédito
  validation/  reglas V01–V20
  services/    orquestación admisión → cobro → factura
  webhooks/    receptor de Factus Pay
  jobs/        worker de facturas y polling de recaudos
  routes/      endpoints internos /api/*
  db/          migraciones y semillas
frontend/src/pages/  Caja, Facturacion, Glosas, Cartera
```

## Cómo correrlo

Requisitos: Node 20+ y PostgreSQL.

```bash
npm install
cp .env.example .env        # llenar con las credenciales sandbox (nunca subirlas)
npm run dev:backend         # http://localhost:3000/api/salud
npm run dev:frontend        # http://localhost:5173
```

## Endpoints de Factus usados

| API | Endpoint | Para qué |
|---|---|---|
| Factus Pay | `POST /auth` | Token Bearer |
| Factus Pay | `POST /v1/collections` | Crear recaudo con QR |
| Factus Pay | `GET /v1/collections/{reference_code}` | Polling de estado |
| Factus Pay | Webhook → `POST /webhooks/factus-pay` | Recaudo pagado |
| Factus Facturación | `POST /oauth/token` | OAuth2 password / refresh |
| Factus Facturación | `POST /v2/bills/validate` | SS-Recaudo y SS-CUFE |
| Factus Facturación | Notas crédito, PDF, XML | Glosas y evidencia DIAN |

## Demo

- App desplegada: _(pendiente)_
- Video: _(pendiente)_

## Declaración

Usamos solo APIs de Factus, sin pasarelas de pago externas. Todo corre en Sandbox, sin dinero real. El código se desarrolló durante el evento.

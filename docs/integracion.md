# Integración con Factus

La especificación técnica completa está en el documento del equipo "SaludFactura: especificación técnica del reto Factus". Aquí va el resumen que pide el checklist de entregables.

## Flujo

1. **Caja**: se crea la admisión → `POST /v1/collections` en Factus Pay → QR Bre-B (`reference_code = ADM-<año>-<admisión>-<concepto>`).
2. **Pago**: el paciente paga (simulador sandbox) → webhook `POST /webhooks/factus-pay?key=…` → se verifica la llave en tiempo constante → se marca `paid`. Respaldo: polling cada 30 s.
3. **SS-Recaudo**: el worker emite la factura del copago con `POST /v2/bills/validate` (`reference_code = FV-` + referencia del recaudo).
4. **SS-CUFE**: al cerrar la atención se factura a la EPS con el objeto `health` y los copagos en `prepayment_details`.
5. **Glosa**: si se acepta, se emite la nota crédito ligada a la SS-CUFE.

## Autenticación

| | Factus Facturación | Factus Pay |
|---|---|---|
| Endpoint | `POST /oauth/token` (password grant) | `POST /auth` |
| Vigencia | 1 hora, se renueva con refresh token 5 min antes | No expira, pero cada `/auth` revoca el anterior |

## Errores

- 401 → renovar token una vez y reintentar
- 409 (Facturación) → consultar por referencia; si `is_validated=false`, eliminar y reenviar una sola vez
- 422/400 → no reintentar; mostrar en el panel
- 5xx → reintentos 2 s, 4 s, 8 s

_(Agregar aquí el diagrama de arquitectura y el de secuencia.)_

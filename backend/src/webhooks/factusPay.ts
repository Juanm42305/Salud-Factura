import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

// POST /webhooks/factus-pay?key=...
// Algoritmo (sección 6.3 de la especificación):
//  1. Comparar key en tiempo constante → 401 si no coincide.
//  2. Guardar evento crudo en webhook_events.
//  3. Buscar recaudo por reference_code y verificar amount.
//  4. Si ya está paid → 200 sin reprocesar (idempotencia).
//  5. Marcar paid, encolar "emitir SS-Recaudo" y responder 200 en < 10 s.

export function isValidWebhookKey(received: unknown, expected: string): boolean {
  if (typeof received !== "string" || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const factusPayWebhookRouter = Router();

factusPayWebhookRouter.post("/", (req, res) => {
  if (!isValidWebhookKey(req.query.key, env.factusPay.webhookKey)) {
    logger.warn("Webhook Factus Pay con llave inválida");
    return res.status(401).json({ error: "unauthorized" });
  }

  // TODO (paso 4 del plan): pasos 2 a 5 del algoritmo.
  logger.info("Webhook Factus Pay recibido", { reference_code: req.body?.data?.reference_code });
  return res.status(200).json({ received: true });
});

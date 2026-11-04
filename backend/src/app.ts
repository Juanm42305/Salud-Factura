import express from "express";
import { saludRouter } from "./routes/salud.js";
import { factusPayWebhookRouter } from "./webhooks/factusPay.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/salud", saludRouter);
  app.use("/webhooks/factus-pay", factusPayWebhookRouter);

  // Próximas rutas (sección 12.3): /api/admisiones, /api/atenciones, /api/glosas,
  // /api/facturas, /api/cartera, /api/validaciones

  return app;
}

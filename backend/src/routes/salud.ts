import { Router } from "express";
import { missingEnv } from "../config/env.js";

// GET /api/salud: prueba de vida que se muestra al inicio de la demo.
// TODO (pasos 1 del plan): verificar token de Factus Facturación, token de Factus Pay y conexión a PostgreSQL.
export const saludRouter = Router();

saludRouter.get("/", (_req, res) => {
  const missing = missingEnv();
  res.json({
    status: missing.length === 0 ? "ok" : "config_incompleta",
    variablesFaltantes: missing,
    checks: {
      factus: "pendiente",
      factusPay: "pendiente",
      baseDeDatos: "pendiente",
    },
  });
});

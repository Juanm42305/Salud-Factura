import { createApp } from "./app.js";
import { env, missingEnv } from "./config/env.js";
import { logger } from "./utils/logger.js";

const app = createApp();

app.listen(env.port, () => {
  logger.info(`SaludFactura backend escuchando en puerto ${env.port}`);
  const missing = missingEnv();
  if (missing.length) logger.warn("Faltan variables de entorno", { missing });
});

// Única fuente de configuración. Las credenciales salen SOLO de variables de entorno.

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "3000")),
  appPublicUrl: optional("APP_PUBLIC_URL"),
  databaseUrl: optional("DATABASE_URL"),

  factus: {
    baseUrl: optional("FACTUS_BASE_URL", "https://api-sandbox.factus.com.co"),
    clientId: optional("FACTUS_CLIENT_ID"),
    clientSecret: optional("FACTUS_CLIENT_SECRET"),
    username: optional("FACTUS_USERNAME"),
    password: optional("FACTUS_PASSWORD"),
    numberingRangeId: optional("FACTUS_NUMBERING_RANGE_ID"),
  },

  factusPay: {
    baseUrl: optional("FACTUS_PAY_BASE_URL", "https://pay-api-sandbox.factus.com.co"),
    email: optional("FACTUS_PAY_EMAIL"),
    password: optional("FACTUS_PAY_PASSWORD"),
    webhookKey: optional("FACTUS_PAY_WEBHOOK_KEY"),
  },
} as const;

/** Nombres de variables obligatorias que faltan (sin exponer valores). */
export function missingEnv(): string[] {
  const required: Record<string, string> = {
    FACTUS_CLIENT_ID: env.factus.clientId,
    FACTUS_CLIENT_SECRET: env.factus.clientSecret,
    FACTUS_USERNAME: env.factus.username,
    FACTUS_PASSWORD: env.factus.password,
    FACTUS_PAY_EMAIL: env.factusPay.email,
    FACTUS_PAY_PASSWORD: env.factusPay.password,
    FACTUS_PAY_WEBHOOK_KEY: env.factusPay.webhookKey,
    DATABASE_URL: env.databaseUrl,
  };
  return Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
}

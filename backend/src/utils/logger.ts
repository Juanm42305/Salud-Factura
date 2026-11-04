// Logger que filtra secretos: Authorization, client_secret, password, token y el ?key= del webhook.

const SECRET_KEYS = /^(authorization|client_secret|password|token|access_token|refresh_token|key)$/i;

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[REDACTED]" : redact(v)]),
    );
  }
  return value;
}

function log(level: "info" | "warn" | "error", msg: string, meta?: unknown) {
  const line = { ts: new Date().toISOString(), level, msg: redact(msg), ...(meta ? { meta: redact(meta) } : {}) };
  console[level](JSON.stringify(line));
}

export const logger = {
  info: (msg: string, meta?: unknown) => log("info", msg, meta),
  warn: (msg: string, meta?: unknown) => log("warn", msg, meta),
  error: (msg: string, meta?: unknown) => log("error", msg, meta),
};

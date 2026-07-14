/** PayPal Orders API adapter config. */

export function isPaypalConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID?.trim() && env.PAYPAL_CLIENT_SECRET?.trim());
}

export function isPaypalEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_PAYPAL_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  return isPaypalConfigured(env);
}

export function paypalApiBase(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PAYPAL_API_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const mode = env.PAYPAL_MODE?.trim().toLowerCase();
  if (mode === "live" || mode === "production") return "https://api-m.paypal.com";
  return "https://api-m.sandbox.paypal.com";
}

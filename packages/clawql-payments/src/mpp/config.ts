/** MPP feature flags and environment configuration. */

export function isMppEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_MPP_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  // Default on when any payment rail is configured.
  const x402 = env.CLAWQL_X402_ENFORCE?.trim().toLowerCase();
  const x402On =
    x402 === "1" || x402 === "true" || x402 === "yes" || x402 === "on";
  const stripeOn = Boolean(env.STRIPE_SECRET_KEY?.trim());
  return x402On || stripeOn;
}

export function isMppOpenApiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_MPP_OPENAPI?.trim().toLowerCase();
  if (raw === "0" || raw === "false") return false;
  return isMppEnabled(env);
}

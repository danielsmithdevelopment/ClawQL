/** Platform creator payouts (Stripe Connect + USDC disbursement intents). */

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseFalsey(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off"
  );
}

export function isPayoutsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseFalsey(env.CLAWQL_PAYOUTS_ENABLED)) return false;
  if (parseTruthy(env.CLAWQL_PAYOUTS_ENABLED)) return true;
  // Default on when Stripe is configured (Connect uses the same secret key).
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

export function isPayoutsDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseTruthy(env.CLAWQL_PAYOUTS_DRY_RUN)) return true;
  if (parseFalsey(env.CLAWQL_PAYOUTS_DRY_RUN)) return false;
  return !env.STRIPE_SECRET_KEY?.trim();
}

export function payoutsDefaultReturnUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAWQL_PAYOUTS_RETURN_URL?.trim() || "https://clawql.local/payouts/return";
}

export function payoutsDefaultRefreshUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAWQL_PAYOUTS_REFRESH_URL?.trim() || "https://clawql.local/payouts/refresh";
}

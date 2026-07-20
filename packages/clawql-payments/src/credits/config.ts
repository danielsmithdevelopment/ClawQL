/** Prepaid credits + bank top-up feature flags. */

export function isCreditsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_CREDITS_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Stripe Financial Connections + ACH debit for credit top-ups. */
export function isAchTopupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_ACH_TOPUP_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  // Default on when credits are enabled and Stripe is configured.
  return isCreditsEnabled(env) && Boolean(env.STRIPE_SECRET_KEY?.trim());
}

/** Complete top-ups without a live ACH debit (tests / local demos). */
export function isAchTopupDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_ACH_TOPUP_DRY_RUN?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function creditsReturnUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.CLAWQL_CREDITS_RETURN_URL?.trim() || undefined;
}

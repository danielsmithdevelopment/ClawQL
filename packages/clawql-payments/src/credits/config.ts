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

/**
 * Sync credit hold/capture on the inference hot path.
 * Defaults on when credits are enabled; set CLAWQL_CREDITS_ENFORCE_INFERENCE=0 to disable.
 */
export function isCreditsInferenceEnforcementActive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isCreditsEnabled(env)) return false;
  if (parseFalsey(env.CLAWQL_CREDITS_ENFORCE_INFERENCE)) return false;
  if (parseTruthy(env.CLAWQL_CREDITS_ENFORCE_INFERENCE)) return true;
  return true;
}

/** Estimated credit cost (USD cents) reserved per inference completion. Default 1¢. */
export function inferenceCreditCostCents(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_CREDITS_INFERENCE_COST_CENTS?.trim();
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 1;
  return Math.round(n);
}

/** Publish deduction events to NATS after outbox append (requires CLAWQL_NATS_URL). */
export function isDeductionNatsPublishEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (parseFalsey(env.CLAWQL_NATS_ENABLE_PUBLISH)) return false;
  if (!env.CLAWQL_NATS_URL?.trim()) return false;
  if (parseTruthy(env.CLAWQL_NATS_ENABLE_PUBLISH)) return true;
  // Default: publish when JetStream flag is on (same as automation).
  return parseTruthy(env.CLAWQL_NATS_JETSTREAM);
}

export function natsPaymentsSubjectRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAWQL_NATS_SUBJECT_PAYMENTS?.trim() || "clawql.payments";
}

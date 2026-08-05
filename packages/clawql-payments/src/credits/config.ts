/** Prepaid credits + bank top-up feature flags. */

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
 * Managed / hosted ClawQL SaaS. When set, peer credit transfer and agent compensation
 * stay disabled regardless of other flags (compliance perimeter).
 */
export function isManagedHosting(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    parseTruthy(env.CLAWQL_MANAGED_HOSTING) ||
    parseTruthy(env.CLAWQL_HOSTED_MODE) ||
    parseTruthy(env.CLAWQL_GATEWAY_MANAGED)
  );
}

export function isCreditsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_CREDITS_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Tenant↔tenant prepaid P2P (Venmo-like). Default **off**.
 * Opt in only on self-hosted: `CLAWQL_CREDITS_P2P_ENABLED=1`.
 * Always off when `CLAWQL_MANAGED_HOSTING=1` (or aliases).
 *
 * Closed-loop credits redeemable for ClawQL services do not require this flag —
 * only peer transfer / money-request accept that moves balance between tenants.
 */
export function isCreditsP2pEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isManagedHosting(env)) return false;
  if (parseFalsey(env.CLAWQL_CREDITS_P2P_ENABLED)) return false;
  return parseTruthy(env.CLAWQL_CREDITS_P2P_ENABLED);
}

export function assertCreditsP2pEnabled(env: NodeJS.ProcessEnv = process.env): void {
  if (isCreditsP2pEnabled(env)) return;
  if (isManagedHosting(env)) {
    throw new Error(
      "Prepaid P2P credit transfer is not available on ClawQL managed hosting. " +
        "Managed plans use Stripe for platform billing only. " +
        "Self-hosted operators may enable CLAWQL_CREDITS_P2P_ENABLED=1 and own compliance."
    );
  }
  throw new Error(
    "Prepaid P2P credit transfer is disabled. Set CLAWQL_CREDITS_P2P_ENABLED=1 on self-hosted " +
      "deployments only after you accept compliance responsibility (not a money transmitter product)."
  );
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

/**
 * When true, `credits transfer` executes immediately (tests / break-glass only).
 * Default off — transfers must stage then confirm (confirmation code).
 */
export function isCreditsTransferDirectAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_CREDITS_TRANSFER_DIRECT);
}

/**
 * When true, confirm also requires a valid TOTP from the sender tenant's enrolled
 * step-up secret (`Payments/step-up-totp.json`).
 */
export function isCreditsTransferTotpRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP);
}

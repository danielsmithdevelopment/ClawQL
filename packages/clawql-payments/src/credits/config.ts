/**
 * Prepaid credits + bank top-up feature flags.
 *
 * Effect-first: every flag reader is an `Effect` (primary API). `CreditsConfigService`
 * bundles them behind a `Context.Tag` so domain code can `yield* config.isCreditsEnabled`
 * instead of calling bare sync functions.
 */

import { Context, Effect, Layer } from "effect";

function truthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function falsey(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off"
  );
}

export const isCreditsEnabled = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> =>
  Effect.sync(() => truthy(env.CLAWQL_CREDITS_ENABLED));


/** Managed / hosted ClawQL SaaS — peer P2P and agent compensation stay off. */
export const isManagedHosting = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> =>
  Effect.sync(
    () =>
      truthy(env.CLAWQL_MANAGED_HOSTING) ||
      truthy(env.CLAWQL_HOSTED_MODE) ||
      truthy(env.CLAWQL_GATEWAY_MANAGED)
  );

/**
 * Cross-tenant Venmo-like P2P. Default off; forced off on managed hosting.
 */
export const isCreditsP2pEnabled = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (yield* isManagedHosting(env)) return false;
    if (falsey(env.CLAWQL_CREDITS_P2P_ENABLED)) return false;
    return truthy(env.CLAWQL_CREDITS_P2P_ENABLED);
  });

/** Sync assert for Effect.gen try/catch edges (throws Error). */
export function assertCreditsP2pEnabled(env: NodeJS.ProcessEnv = process.env): void {
  const managed =
    truthy(env.CLAWQL_MANAGED_HOSTING) ||
    truthy(env.CLAWQL_HOSTED_MODE) ||
    truthy(env.CLAWQL_GATEWAY_MANAGED);
  if (managed) {
    throw new Error(
      "Cross-tenant credits P2P is disabled on managed hosting (CLAWQL_MANAGED_HOSTING)"
    );
  }
  if (!truthy(env.CLAWQL_CREDITS_P2P_ENABLED)) {
    throw new Error("Credits P2P disabled — set CLAWQL_CREDITS_P2P_ENABLED=1");
  }
}

/**
 * Within-company org credit allocate / peer transfer (closed-loop).
 * Default on when credits enabled; allowed on managed hosting.
 */
export const isCreditsOrgTransferEnabled = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (!(yield* isCreditsEnabled(env))) return false;
    if (falsey(env.CLAWQL_CREDITS_ORG_TRANSFER_ENABLED)) return false;
    if (truthy(env.CLAWQL_CREDITS_ORG_TRANSFER_ENABLED)) return true;
    return true;
  });

export function assertCreditsOrgTransferEnabled(env: NodeJS.ProcessEnv = process.env): void {
  const creditsOn = truthy(env.CLAWQL_CREDITS_ENABLED);
  if (!creditsOn) {
    throw new Error("Credits disabled — set CLAWQL_CREDITS_ENABLED=1");
  }
  if (falsey(env.CLAWQL_CREDITS_ORG_TRANSFER_ENABLED)) {
    throw new Error("Org credit transfers disabled — unset CLAWQL_CREDITS_ORG_TRANSFER_ENABLED=0");
  }
}


/** Stripe Financial Connections + ACH debit for credit top-ups. */
export const isAchTopupEnabled = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const raw = env.CLAWQL_ACH_TOPUP_ENABLED;
    if (falsey(raw)) return false;
    if (truthy(raw)) return true;
    // Default on when credits are enabled and Stripe is configured.
    return (yield* isCreditsEnabled(env)) && Boolean(env.STRIPE_SECRET_KEY?.trim());
  });

/** Complete top-ups without a live ACH debit (tests / local demos). */
export const isAchTopupDryRun = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> =>
  Effect.sync(() => truthy(env.CLAWQL_ACH_TOPUP_DRY_RUN));

export const creditsReturnUrl = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string | undefined> =>
  Effect.sync(() => env.CLAWQL_CREDITS_RETURN_URL?.trim() || undefined);

/**
 * Sync credit hold/capture on the inference hot path.
 * Defaults on when credits are enabled; set CLAWQL_CREDITS_ENFORCE_INFERENCE=0 to disable.
 */
export const isCreditsInferenceEnforcementActive = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (!(yield* isCreditsEnabled(env))) return false;
    if (falsey(env.CLAWQL_CREDITS_ENFORCE_INFERENCE)) return false;
    if (truthy(env.CLAWQL_CREDITS_ENFORCE_INFERENCE)) return true;
    return true;
  });

/** Estimated credit cost (USD cents) reserved per inference completion. Default 1¢. */
export const inferenceCreditCostCents = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<number> =>
  Effect.sync(() => {
    const raw = env.CLAWQL_CREDITS_INFERENCE_COST_CENTS?.trim();
    if (!raw) return 1;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 1;
    return Math.round(n);
  });

/** Publish deduction events to NATS after outbox append (requires CLAWQL_NATS_URL). */
export const isDeductionNatsPublishEnabled = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (falsey(env.CLAWQL_NATS_ENABLE_PUBLISH)) return false;
    if (!env.CLAWQL_NATS_URL?.trim()) return false;
    if (truthy(env.CLAWQL_NATS_ENABLE_PUBLISH)) return true;
    // Default: publish when JetStream flag is on (same as automation).
    return truthy(env.CLAWQL_NATS_JETSTREAM);
  });

export const natsPaymentsSubjectRoot = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.sync(() => env.CLAWQL_NATS_SUBJECT_PAYMENTS?.trim() || "clawql.payments");

/**
 * When true, `credits transfer` executes immediately (tests / break-glass only).
 * Default off — transfers must stage then confirm (confirmation code).
 */
export const isCreditsTransferDirectAllowed = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> => Effect.sync(() => truthy(env.CLAWQL_CREDITS_TRANSFER_DIRECT));

/**
 * When true, confirm also requires a valid TOTP from the sender tenant's enrolled
 * step-up secret (`Payments/step-up-totp.json`).
 */
export const isCreditsTransferTotpRequired = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> => Effect.sync(() => truthy(env.CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP));

/** Effect surface over prepaid credits feature flags (yield methods inside `Effect.gen`). */
export class CreditsConfigService extends Context.Tag("clawql/CreditsConfigService")<
  CreditsConfigService,
  {
    readonly isCreditsEnabled: Effect.Effect<boolean>;
    readonly isAchTopupEnabled: Effect.Effect<boolean>;
    readonly isAchTopupDryRun: Effect.Effect<boolean>;
    readonly creditsReturnUrl: Effect.Effect<string | undefined>;
    readonly isCreditsInferenceEnforcementActive: Effect.Effect<boolean>;
    readonly inferenceCreditCostCents: Effect.Effect<number>;
    readonly isDeductionNatsPublishEnabled: Effect.Effect<boolean>;
    readonly natsPaymentsSubjectRoot: Effect.Effect<string>;
    readonly isCreditsTransferDirectAllowed: Effect.Effect<boolean>;
    readonly isCreditsTransferTotpRequired: Effect.Effect<boolean>;
    readonly isManagedHosting: Effect.Effect<boolean>;
    readonly isCreditsP2pEnabled: Effect.Effect<boolean>;
    readonly isCreditsOrgTransferEnabled: Effect.Effect<boolean>;
  }
>() {}

/** Live flag service bound to a specific environment snapshot. */
export const creditsConfigLiveLayer = (
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<CreditsConfigService> =>
  Layer.succeed(
    CreditsConfigService,
    CreditsConfigService.of({
      isCreditsEnabled: isCreditsEnabled(env),
      isAchTopupEnabled: isAchTopupEnabled(env),
      isAchTopupDryRun: isAchTopupDryRun(env),
      creditsReturnUrl: creditsReturnUrl(env),
      isCreditsInferenceEnforcementActive: isCreditsInferenceEnforcementActive(env),
      inferenceCreditCostCents: inferenceCreditCostCents(env),
      isDeductionNatsPublishEnabled: isDeductionNatsPublishEnabled(env),
      natsPaymentsSubjectRoot: natsPaymentsSubjectRoot(env),
      isCreditsTransferDirectAllowed: isCreditsTransferDirectAllowed(env),
      isCreditsTransferTotpRequired: isCreditsTransferTotpRequired(env),
      isManagedHosting: isManagedHosting(env),
      isCreditsP2pEnabled: isCreditsP2pEnabled(env),
      isCreditsOrgTransferEnabled: isCreditsOrgTransferEnabled(env),
    })
  );

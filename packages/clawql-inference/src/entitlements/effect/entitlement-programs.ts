import {
  buildEntitlementLimitReachedEntry,
  entitlementsFromPlan,
  isStripeMeterReportingActive,
} from "clawql-payments";
import {
  EntitlementService,
  PaymentAuditService,
  PaymentsConfigService,
  StripeMeterService,
  UsageStoreService,
  type PaymentsServices,
} from "clawql-payments/plugin";
import { Effect } from "effect";
import { isInferenceEntitlementEnforcementActive } from "../flags.js";
import { EntitlementLimitError } from "../errors.js";

export type InferenceTenantContext = {
  team?: string;
  tenantId?: string;
};

/** Resolve billing tenant from request context or payments config. */
export function resolveInferenceTenantIdEffect(
  context: InferenceTenantContext = {}
): Effect.Effect<string, unknown, PaymentsConfigService> {
  return Effect.gen(function* () {
    if (context.tenantId?.trim()) return context.tenantId.trim();
    if (context.team?.trim()) return context.team.trim();
    const configService = yield* PaymentsConfigService;
    const config = yield* configService.load();
    return config.tenantId?.trim() || "default";
  });
}

export type AssertInferenceEntitlementInput = {
  tenantId: string;
  requested?: number;
  correlationId?: string;
};

/** Assert monthly inference entitlement; audit and fail when over limit. */
export function assertInferenceEntitlementEffect(
  input: AssertInferenceEntitlementInput
): Effect.Effect<void, unknown, PaymentsServices> {
  return Effect.gen(function* () {
    const configService = yield* PaymentsConfigService;
    const config = yield* configService.load();
    const entitlements = entitlementsFromPlan(config.plan);
    const usageStore = yield* UsageStoreService;
    const usage = yield* usageStore.getUsage(input.tenantId);
    const entitlement = yield* EntitlementService;
    const check = yield* entitlement.checkLimit({
      entitlements,
      usage,
      resource: "inference_calls",
      requested: input.requested ?? 1,
    });

    if (!check.allowed) {
      const audit = yield* PaymentAuditService;
      yield* audit.appendEntry(
        buildEntitlementLimitReachedEntry({
          tenantId: input.tenantId,
          plan: config.plan,
          resource: "inference_calls",
          correlationId: input.correlationId,
        })
      );
      return yield* Effect.fail(new EntitlementLimitError(check.reason));
    }
  });
}

export type RecordInferenceBillingInput = {
  tenantId: string;
  amount?: number;
  correlationId?: string;
  env: NodeJS.ProcessEnv;
};

/** Increment inference usage counter for the current month. */
export function recordInferenceUsageEffect(
  input: Omit<RecordInferenceBillingInput, "env"> & { env?: NodeJS.ProcessEnv }
): Effect.Effect<void, unknown, PaymentsServices> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    if (!isInferenceEntitlementEnforcementActive(env)) return;
    const configService = yield* PaymentsConfigService;
    const config = yield* configService.load();
    const usageStore = yield* UsageStoreService;
    yield* usageStore.increment(
      input.tenantId,
      "inference_calls",
      input.amount ?? 1,
      config.plan
    );
  });
}

/** Increment usage counters and report Stripe meter events when configured. */
export function recordInferenceBillingEffect(
  input: RecordInferenceBillingInput
): Effect.Effect<void, unknown, PaymentsServices> {
  return Effect.gen(function* () {
    if (isInferenceEntitlementEnforcementActive(input.env)) {
      const configService = yield* PaymentsConfigService;
      const config = yield* configService.load();
      const usageStore = yield* UsageStoreService;
      yield* usageStore.increment(
        input.tenantId,
        "inference_calls",
        input.amount ?? 1,
        config.plan
      );
    }
    if (isStripeMeterReportingActive(input.env)) {
      const meter = yield* StripeMeterService;
      yield* meter.reportInferenceUsageIfEnabled({
        tenantId: input.tenantId,
        value: input.amount ?? 1,
        correlationId: input.correlationId,
        env: input.env,
      });
    }
  });
}

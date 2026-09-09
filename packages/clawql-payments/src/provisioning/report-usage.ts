/**
 * Thin Stripe-facing usage reporter — overage only; credit debits never meter.
 * @see docs/specs/billing/hybrid-billing-v0.1.md
 */

import { Context, Effect, Layer } from "effect";
import { buildUsageReportedToBillingEntry } from "../audit/events.js";
import { getOrg } from "../credits/org.js";
import { PaymentError } from "../errors/payment-errors.js";
import { getPlanDefinition, type ClawqlPlanId } from "../plans/tiers.js";
import { UsageStoreService } from "../plans/usage-store-service.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import {
  StripeMeterService,
  isStripeMeterReportingActive,
} from "../stripe/stripe-meter-service.js";
import type { ConfigError } from "../errors/payment-errors.js";
import type { StripeApiError, StripeNotConfigured } from "../stripe/stripe-errors.js";
import { ProvisionOrgError } from "./provision-org-service.js";
import type { ReportUsageToStripeInput, ReportUsageToStripeResult } from "./types.js";

export class ReportUsageService extends Context.Tag("clawql/ReportUsageService")<
  ReportUsageService,
  {
    readonly reportUsageToStripe: (
      input: ReportUsageToStripeInput
    ) => Effect.Effect<
      ReportUsageToStripeResult,
      ProvisionOrgError | PaymentError | ConfigError | StripeApiError | StripeNotConfigured
    >;
  }
>() {}

function currentMonthUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function includedInferenceQuota(planId: ClawqlPlanId): number {
  const def = getPlanDefinition(planId);
  return Number.isFinite(def.inference_calls_per_month)
    ? def.inference_calls_per_month
    : Number.POSITIVE_INFINITY;
}

export function reportUsageLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<
  ReportUsageService,
  never,
  StripeMeterService | UsageStoreService | PaymentAuditService
> {
  return Layer.effect(
    ReportUsageService,
    Effect.gen(function* () {
      const meter = yield* StripeMeterService;
      const usage = yield* UsageStoreService;
      const audit = yield* PaymentAuditService;

      const reportUsageToStripe = (input: ReportUsageToStripeInput) =>
        Effect.gen(function* () {
          const runEnv = input.env ?? env;
          const org = yield* Effect.tryPromise({
            try: () => getOrg(input.orgId, runEnv),
            catch: (cause) => new ProvisionOrgError({ reason: "Failed to load org", cause }),
          });
          if (!org) {
            return yield* Effect.fail(
              new ProvisionOrgError({ reason: `Unknown org: ${input.orgId}` })
            );
          }

          const planId = (org.planId ?? "team") as ClawqlPlanId;
          const includedQuota = includedInferenceQuota(planId);
          const month = input.month?.trim() || currentMonthUtc();

          const tenantIds = [org.poolTenantId, ...org.members.map((m) => m.memberTenantId)];
          let totalUsage = 0;
          for (const tenantId of tenantIds) {
            const row = yield* usage.getUsage(tenantId, month);
            totalUsage += row.inferenceCalls;
          }

          const overageUnits =
            input.overageUnits !== undefined
              ? Math.max(0, Math.round(input.overageUnits))
              : Number.isFinite(includedQuota)
                ? Math.max(0, totalUsage - includedQuota)
                : 0;

          const base = {
            overageUnits,
            includedQuota: Number.isFinite(includedQuota) ? includedQuota : totalUsage,
            totalUsage,
          };

          if (org.billingMode === "credits_only") {
            return {
              reported: false as const,
              reason: "billingMode credits_only never reports Stripe meters",
              ...base,
            };
          }

          if (overageUnits <= 0) {
            return {
              reported: false as const,
              reason: "no overage to report",
              ...base,
            };
          }

          if (!isStripeMeterReportingActive(runEnv)) {
            return {
              reported: false as const,
              reason: "stripe meter reporting is disabled",
              ...base,
            };
          }

          const customerId = org.stripeCustomerId?.trim();
          if (!customerId) {
            return {
              reported: false as const,
              reason: "org has no stripeCustomerId",
              ...base,
            };
          }

          const meterConfig = yield* meter.resolveMeterConfig(runEnv);
          if (!meterConfig?.eventName) {
            return {
              reported: false as const,
              reason: "stripe meter event name is not configured",
              ...base,
            };
          }

          const identifier =
            input.identifier ?? `org-overage:${org.orgId}:${month}:${overageUnits}`;

          const result = yield* meter.reportMeteredUsage({
            eventName: meterConfig.eventName,
            stripeCustomerId: customerId,
            value: overageUnits,
            identifier,
            env: runEnv,
          });

          yield* audit.appendEntry(
            buildUsageReportedToBillingEntry({
              orgId: org.orgId,
              tenantId: org.poolTenantId,
              overageUnits,
              eventName: meterConfig.eventName,
              stripeCustomerId: customerId,
              correlationId: input.correlationId,
            })
          );

          return {
            reported: true as const,
            eventId: result.id,
            ...base,
          };
        });

      return ReportUsageService.of({ reportUsageToStripe });
    })
  );
}

/** Convenience Effect that requires {@link ReportUsageService}. */
export function reportUsageToStripeEffect(
  input: ReportUsageToStripeInput
): Effect.Effect<
  ReportUsageToStripeResult,
  ProvisionOrgError | PaymentError | ConfigError | StripeApiError | StripeNotConfigured,
  ReportUsageService
> {
  return Effect.gen(function* () {
    const svc = yield* ReportUsageService;
    return yield* svc.reportUsageToStripe(input);
  });
}

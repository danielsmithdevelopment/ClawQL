import { Context, Effect, Layer } from "effect";
import {
  EntitlementService,
  PaymentAuditService,
  PaymentsConfigService,
  StripeMeterService,
  UsageStoreService,
  type PaymentsServices,
} from "clawql-payments/plugin";
import {
  buildEntitlementLimitReachedEntry,
  entitlementsFromPlan,
} from "clawql-payments";
import type { InferenceRequest, InferenceResponse } from "../../gateway.js";
import { InferenceGatewayService } from "../../fallback/effect/inference-gateway-service.js";
import { isInferenceEntitlementEnforcementActive } from "../flags.js";
import { EntitlementLimitError } from "../errors.js";
import { isStripeMeterReportingActive } from "clawql-payments";

/** Effect service for plan entitlement checks around gateway completion. */
export class EntitlementEnforcementService extends Context.Tag(
  "clawql/EntitlementEnforcementService"
)<
  EntitlementEnforcementService,
  {
    readonly completeWithEnforcement: (
      request: InferenceRequest
    ) => Effect.Effect<InferenceResponse, unknown>;
  }
>() {}

export function entitlementEnforcementLiveLayer(
  env: NodeJS.ProcessEnv
): Layer.Layer<
  EntitlementEnforcementService,
  never,
  InferenceGatewayService | PaymentsServices
> {
  return Layer.effect(
    EntitlementEnforcementService,
    Effect.gen(function* () {
      const gateway = yield* InferenceGatewayService;
      const configService = yield* PaymentsConfigService;
      const usageStore = yield* UsageStoreService;
      const entitlement = yield* EntitlementService;
      const audit = yield* PaymentAuditService;
      const meter = yield* StripeMeterService;

      const completeWithEnforcement = (request: InferenceRequest) =>
        Effect.gen(function* () {
          let tenantId = request.tenantId?.trim();
          if (!tenantId && request.team?.trim()) tenantId = request.team.trim();
          if (!tenantId) {
            const config = yield* configService.load();
            tenantId = config.tenantId?.trim() || "default";
          }

          if (isInferenceEntitlementEnforcementActive(env)) {
            const config = yield* configService.load();
            const entitlements = entitlementsFromPlan(config.plan);
            const usage = yield* usageStore.getUsage(tenantId);
            const check = yield* entitlement.checkLimit({
              entitlements,
              usage,
              resource: "inference_calls",
              requested: 1,
            });
            if (!check.allowed) {
              yield* audit.appendEntry(
                buildEntitlementLimitReachedEntry({
                  tenantId,
                  plan: config.plan,
                  resource: "inference_calls",
                  correlationId: request.correlationId,
                })
              );
              return yield* Effect.fail(new EntitlementLimitError(check.reason));
            }
          }

          const response = yield* gateway.complete(request);

          if (isInferenceEntitlementEnforcementActive(env)) {
            const config = yield* configService.load();
            yield* usageStore.increment(tenantId, "inference_calls", 1, config.plan);
          }
          if (isStripeMeterReportingActive(env)) {
            yield* meter.reportInferenceUsageIfEnabled({
              tenantId,
              value: 1,
              correlationId: request.correlationId,
              env,
            });
          }

          return response;
        });

      return EntitlementEnforcementService.of({ completeWithEnforcement });
    })
  );
}

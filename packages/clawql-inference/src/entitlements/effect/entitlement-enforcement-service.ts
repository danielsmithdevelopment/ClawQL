import { Context, Effect, Layer } from "effect";
import {
  DeductionService,
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
  inferenceCreditCostCents,
  isCreditsInferenceEnforcementActive,
} from "clawql-payments";
import type { InferenceRequest, InferenceResponse } from "../../gateway.js";
import { InferenceGatewayService } from "../../fallback/effect/inference-gateway-service.js";
import { isInferenceEntitlementEnforcementActive } from "../flags.js";
import { EntitlementLimitError } from "../errors.js";
import { isStripeMeterReportingActive } from "clawql-payments";

/** Effect service for plan entitlement + sync credit hold around gateway completion. */
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

function inferenceIdempotencyKey(tenantId: string, request: InferenceRequest): string {
  const corr = request.correlationId?.trim();
  if (corr) return `inference:${tenantId}:${corr}`;
  return `inference:${tenantId}:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function entitlementEnforcementLiveLayer(
  env: NodeJS.ProcessEnv
): Layer.Layer<EntitlementEnforcementService, never, InferenceGatewayService | PaymentsServices> {
  return Layer.effect(
    EntitlementEnforcementService,
    Effect.gen(function* () {
      const gateway = yield* InferenceGatewayService;
      const configService = yield* PaymentsConfigService;
      const usageStore = yield* UsageStoreService;
      const entitlement = yield* EntitlementService;
      const audit = yield* PaymentAuditService;
      const meter = yield* StripeMeterService;
      const deduction = yield* DeductionService;

      const completeWithEnforcement = (request: InferenceRequest) =>
        Effect.gen(function* () {
          let tenantIdRaw = request.tenantId?.trim();
          if (!tenantIdRaw && request.team?.trim()) tenantIdRaw = request.team.trim();
          if (!tenantIdRaw) {
            const config = yield* configService.load();
            tenantIdRaw = config.tenantId?.trim() || "default";
          }
          const tenantId: string = tenantIdRaw;

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

          const creditsActive = isCreditsInferenceEnforcementActive(env);
          const costCents = inferenceCreditCostCents(env);
          const idempotencyKey = inferenceIdempotencyKey(tenantId, request);
          let held = false;

          if (creditsActive && costCents > 0) {
            const holdResult = yield* deduction
              .hold({
                tenantId,
                amountCents: costCents,
                idempotencyKey,
                resource: "inference_calls",
                correlationId: request.correlationId,
                note: request.model ? `inference ${request.model}` : "inference",
              })
              .pipe(
                Effect.mapError(
                  (e) =>
                    new EntitlementLimitError(
                      e && typeof e === "object" && "reason" in e
                        ? String((e as { reason: string }).reason)
                        : "Insufficient credits"
                    )
                )
              );
            held = true;
            void holdResult;
          }

          const response = yield* gateway.complete(request).pipe(
            Effect.tapError(() =>
              held
                ? deduction
                    .release({
                      tenantId,
                      idempotencyKey,
                      correlationId: request.correlationId,
                      note: "inference failed — release hold",
                    })
                    .pipe(Effect.catchAll(() => Effect.void))
                : Effect.void
            )
          );

          if (held) {
            yield* deduction
              .capture({
                tenantId,
                idempotencyKey,
                actualAmountCents: costCents,
                correlationId: request.correlationId,
                note: "inference completed",
              })
              .pipe(Effect.catchAll(() => Effect.void));
          }

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

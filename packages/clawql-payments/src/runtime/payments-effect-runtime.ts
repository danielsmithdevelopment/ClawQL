import { Cause, Effect, Exit, Layer } from "effect";
import { paymentsConfigLiveLayer } from "../config/payments-config-service.js";
import { paymentsDiscoveryLiveLayer } from "../discovery/payments-discovery-service.js";
import { mppOpenApiLiveLayer } from "../mpp/openapi-service.js";
import { mppVerificationLiveLayer } from "../mpp/verification-service.js";
import { entitlementLiveLayer } from "../plans/entitlement-service.js";
import { usageStoreLiveLayer } from "../plans/usage-store-service.js";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
import { stripeBillingLiveLayer } from "../stripe/stripe-billing-service.js";
import { stripeClientLiveLayer } from "../stripe/stripe-client-service.js";
import { stripeMeterLiveLayer } from "../stripe/stripe-meter-service.js";
import { stripeWebhookLiveLayer } from "../stripe/stripe-webhook-service.js";
import { x402EnforcementLiveLayer } from "../x402/x402-enforcement-service.js";
import { x402FacilitatorLiveLayer } from "../x402/x402-facilitator-service.js";
import { x402GateLiveLayer } from "../x402/x402-gate-service.js";
import { x402RuntimeConfigLiveLayer } from "../x402/x402-runtime-config-service.js";

export type PaymentsServices =
  | import("../config/payments-config-service.js").PaymentsConfigService
  | import("../plugin/payment-audit-service.js").PaymentAuditService
  | import("../x402/x402-gate-service.js").X402GateService
  | import("../x402/x402-runtime-config-service.js").X402RuntimeConfigService
  | import("../x402/x402-facilitator-service.js").X402FacilitatorService
  | import("../x402/x402-enforcement-service.js").X402EnforcementService
  | import("../plans/usage-store-service.js").UsageStoreService
  | import("../plans/entitlement-service.js").EntitlementService
  | import("../discovery/payments-discovery-service.js").PaymentsDiscoveryService
  | import("../mpp/openapi-service.js").MppOpenApiService
  | import("../mpp/verification-service.js").MppVerificationService
  | import("../stripe/stripe-client-service.js").StripeClientService
  | import("../stripe/stripe-webhook-service.js").StripeWebhookService
  | import("../stripe/stripe-meter-service.js").StripeMeterService
  | import("../stripe/stripe-billing-service.js").StripeBillingService;

const layerCache = new Map<string, Layer.Layer<PaymentsServices>>();

/** Merged Effect Layer for all clawql-payments services. */
export function paymentsServicesLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<PaymentsServices> {
  const key = env.CLAWQL_HOME?.trim() || "default";
  const cached = layerCache.get(key);
  if (cached) return cached;

  const config = paymentsConfigLiveLayer(env);
  const audit = paymentAuditLiveLayer(env);
  const gate = x402GateLiveLayer(env);
  const usage = usageStoreLiveLayer(env);
  const entitlement = entitlementLiveLayer();
  const facilitator = x402FacilitatorLiveLayer(env);
  const stripeClient = stripeClientLiveLayer(env);

  const runtimeConfig = x402RuntimeConfigLiveLayer(env).pipe(Layer.provide(config));
  const mppOpenApi = mppOpenApiLiveLayer(env).pipe(
    Layer.provide(Layer.mergeAll(runtimeConfig, gate))
  );
  const mppVerification = mppVerificationLiveLayer(env).pipe(
    Layer.provide(Layer.mergeAll(config, audit, runtimeConfig, facilitator, stripeClient))
  );
  const enforcement = x402EnforcementLiveLayer().pipe(
    Layer.provide(Layer.mergeAll(config, audit, gate, runtimeConfig, facilitator, mppVerification))
  );
  const discovery = paymentsDiscoveryLiveLayer(env).pipe(
    Layer.provide(Layer.mergeAll(config, runtimeConfig, gate))
  );
  const stripeWebhook = stripeWebhookLiveLayer().pipe(Layer.provide(Layer.mergeAll(config, audit)));
  const stripeMeter = stripeMeterLiveLayer(env).pipe(
    Layer.provide(Layer.mergeAll(stripeClient, config, audit))
  );
  const stripeBilling = stripeBillingLiveLayer(env).pipe(
    Layer.provide(Layer.mergeAll(stripeClient, config))
  );

  const layer = Layer.mergeAll(
    config,
    audit,
    gate,
    usage,
    entitlement,
    facilitator,
    runtimeConfig,
    enforcement,
    discovery,
    mppOpenApi,
    mppVerification,
    stripeClient,
    stripeWebhook,
    stripeMeter,
    stripeBilling
  );
  layerCache.set(key, layer);
  return layer;
}

/** Run a payments Effect program with the default services Layer. */
export async function runPaymentsEffect<A, E>(
  program: Effect.Effect<A, E, PaymentsServices>,
  env: NodeJS.ProcessEnv = process.env
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(paymentsServicesLiveLayer(env)))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
}

/** Reset cached Layer (tests). */
export function resetPaymentsEffectRuntimeForTests(): void {
  layerCache.clear();
}

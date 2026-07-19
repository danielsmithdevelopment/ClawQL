import { AuditLive } from "clawql-core";
import { Cause, Effect, Exit, Layer } from "effect";
import { paymentsConfigLiveLayer } from "../config/payments-config-service.js";
import { paymentsDiscoveryLiveLayer } from "../discovery/payments-discovery-service.js";
import { ap2MandateLiveLayer } from "../ap2/ap2-mandate-service.js";
import { acpCheckoutLiveLayer } from "../acp/acp-checkout-service.js";
import { paypalOrdersLiveLayer } from "../paypal/paypal-orders-service.js";
import { adyenCheckoutLiveLayer } from "../adyen/adyen-checkout-service.js";
import { payoutLiveLayer } from "../payouts/payout-service.js";
import { rampLiveLayer } from "../ramp/ramp-service.js";
import { consumerOffRampLiveLayer } from "../offramp/consumer-offramp-service.js";
import { offrampWebhookLiveLayer } from "../offramp/offramp-webhook-service.js";
import { mppOpenApiLiveLayer } from "../mpp/openapi-service.js";
import { mppVerificationLiveLayer } from "../mpp/verification-service.js";
import { mppxAdapterLiveLayer } from "../mpp/mppx-adapter.js";
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
  | import("../mpp/mppx-adapter.js").MppxAdapterService
  | import("../stripe/stripe-client-service.js").StripeClientService
  | import("../stripe/stripe-webhook-service.js").StripeWebhookService
  | import("../stripe/stripe-meter-service.js").StripeMeterService
  | import("../stripe/stripe-billing-service.js").StripeBillingService
  | import("../ap2/ap2-mandate-service.js").Ap2MandateService
  | import("../acp/acp-checkout-service.js").AcpCheckoutService
  | import("../paypal/paypal-orders-service.js").PaypalOrdersService
  | import("../adyen/adyen-checkout-service.js").AdyenCheckoutService
  | import("../payouts/payout-service.js").PayoutService
  | import("../ramp/ramp-service.js").RampService
  | import("../offramp/consumer-offramp-service.js").ConsumerOffRampService
  | import("../offramp/offramp-webhook-service.js").OfframpWebhookService;

const layerCache = new Map<string, Layer.Layer<PaymentsServices>>();

/** Merged Effect Layer for all clawql-payments services. */
export function paymentsServicesLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<PaymentsServices> {
  const key = env.CLAWQL_HOME?.trim() || "default";
  const cached = layerCache.get(key);
  if (cached) return cached;

  const config = paymentsConfigLiveLayer(env);
  const audit = paymentAuditLiveLayer(env).pipe(Layer.provide(AuditLive));
  const gate = x402GateLiveLayer(env);
  const usage = usageStoreLiveLayer(env);
  const entitlement = entitlementLiveLayer();
  const facilitator = x402FacilitatorLiveLayer(env);
  const stripeClient = stripeClientLiveLayer(env);
  const ap2 = ap2MandateLiveLayer(env).pipe(Layer.provide(audit));
  const acp = acpCheckoutLiveLayer(env).pipe(Layer.provide(Layer.mergeAll(audit, stripeClient)));
  const paypal = paypalOrdersLiveLayer(env).pipe(Layer.provide(audit));
  const adyen = adyenCheckoutLiveLayer(env).pipe(Layer.provide(audit));
  const payouts = payoutLiveLayer(env).pipe(Layer.provide(Layer.mergeAll(audit, stripeClient)));
  const ramp = rampLiveLayer(env).pipe(Layer.provide(audit));
  const offramp = consumerOffRampLiveLayer(env).pipe(Layer.provide(audit));
  const offrampWebhook = offrampWebhookLiveLayer(env).pipe(Layer.provide(audit));

  const runtimeConfig = x402RuntimeConfigLiveLayer(env).pipe(Layer.provide(config));
  const mppOpenApi = mppOpenApiLiveLayer(env).pipe(
    Layer.provide(Layer.mergeAll(runtimeConfig, gate))
  );
  const mppVerification = mppVerificationLiveLayer(env).pipe(
    Layer.provide(Layer.mergeAll(config, audit, runtimeConfig, facilitator, stripeClient))
  );
  const mppxAdapter = mppxAdapterLiveLayer(env);
  const enforcement = x402EnforcementLiveLayer().pipe(
    Layer.provide(
      Layer.mergeAll(config, audit, gate, runtimeConfig, facilitator, mppVerification, ap2)
    )
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
    mppxAdapter,
    stripeClient,
    stripeWebhook,
    stripeMeter,
    stripeBilling,
    ap2,
    acp,
    paypal,
    adyen,
    payouts,
    ramp,
    offramp,
    offrampWebhook
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

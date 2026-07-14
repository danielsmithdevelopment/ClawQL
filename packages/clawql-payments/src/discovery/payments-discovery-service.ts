import { Context, Effect, Layer } from "effect";
import { ConfigError, X402Error } from "../errors/payment-errors.js";
import { CLAWQL_PLANS } from "../plans/tiers.js";
import { PaymentsConfigService } from "../config/payments-config-service.js";
import { isAp2Enabled, isAp2Required } from "../ap2/config.js";
import { isAcpEnabled } from "../acp/config.js";
import { isPaypalEnabled, paypalApiBase } from "../paypal/config.js";
import { adyenEnvironment, adyenMerchantAccount, isAdyenEnabled } from "../adyen/config.js";
import { X402GateService } from "../x402/x402-gate-service.js";
import { X402RuntimeConfigService } from "../x402/x402-runtime-config-service.js";
import { X402_VERSION } from "../x402/types.js";

export type PaymentsWellKnownResource = {
  kind: "http" | "mcp_tool";
  id: string;
  price_usdc: number;
  asset: string;
};

export type PaymentsWellKnownMethod = {
  type: "x402" | "stripe" | "ap2" | "acp" | "paypal" | "adyen";
  enabled: boolean;
};

export type PaymentsWellKnownX402Method = PaymentsWellKnownMethod & {
  type: "x402";
  x402_version: number;
  scheme: string;
  network: string;
  asset: string;
  asset_contract: string;
  pay_to?: string;
  facilitator?: string;
  resources: PaymentsWellKnownResource[];
};

export type PaymentsWellKnownStripeMethod = PaymentsWellKnownMethod & {
  type: "stripe";
  billing: "subscription" | "metered";
  plans: string[];
  meter_event_name?: string;
};

export type PaymentsWellKnownAp2Method = PaymentsWellKnownMethod & {
  type: "ap2";
  protocol: "ap2";
  mandate_types: string[];
  require: boolean;
  documentation: string;
};

export type PaymentsWellKnownAcpMethod = PaymentsWellKnownMethod & {
  type: "acp";
  protocol: "acp";
  checkout: "sessions";
  payment_provider: "stripe";
  documentation: string;
};

export type PaymentsWellKnownPaypalMethod = PaymentsWellKnownMethod & {
  type: "paypal";
  api_base: string;
  documentation: string;
};

export type PaymentsWellKnownAdyenMethod = PaymentsWellKnownMethod & {
  type: "adyen";
  environment: "test" | "live";
  merchant_account?: string;
  documentation: string;
};

export type PaymentsWellKnownDocument = {
  version: string;
  server_name: string;
  documentation: string;
  issue?: string;
  payment_methods: Array<
    | PaymentsWellKnownX402Method
    | PaymentsWellKnownStripeMethod
    | PaymentsWellKnownAp2Method
    | PaymentsWellKnownAcpMethod
    | PaymentsWellKnownPaypalMethod
    | PaymentsWellKnownAdyenMethod
  >;
  default: "x402" | "stripe" | "ap2" | "acp" | "paypal" | "adyen" | null;
  updated_at: string;
};

export type BuildPaymentsWellKnownOptions = {
  env?: NodeJS.ProcessEnv;
  serverName?: string;
  documentationUrl?: string;
  origin?: string;
};

function resourceFromGate(gate: {
  resource: string;
  tool?: string;
  price: number;
  asset: string;
}): PaymentsWellKnownResource {
  if (gate.tool?.trim()) {
    return {
      kind: "mcp_tool",
      id: gate.tool.trim(),
      price_usdc: gate.price,
      asset: gate.asset,
    };
  }
  return {
    kind: "http",
    id: gate.resource,
    price_usdc: gate.price,
    asset: gate.asset,
  };
}

/** Effect service for `/.well-known/payments.json` document generation. */
export class PaymentsDiscoveryService extends Context.Tag("clawql/PaymentsDiscoveryService")<
  PaymentsDiscoveryService,
  {
    readonly buildDocument: (
      options?: BuildPaymentsWellKnownOptions
    ) => Effect.Effect<PaymentsWellKnownDocument, ConfigError | X402Error>;
    readonly renderJson: (
      options?: BuildPaymentsWellKnownOptions
    ) => Effect.Effect<string, ConfigError | X402Error>;
  }
>() {}

export function paymentsDiscoveryLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<
  PaymentsDiscoveryService,
  never,
  PaymentsConfigService | X402RuntimeConfigService | X402GateService
> {
  return Layer.effect(
    PaymentsDiscoveryService,
    Effect.gen(function* () {
      const configService = yield* PaymentsConfigService;
      const runtimeConfig = yield* X402RuntimeConfigService;
      const gates = yield* X402GateService;

      const buildDocument = (options: BuildPaymentsWellKnownOptions = {}) =>
        Effect.gen(function* () {
          const runEnv = options.env ?? env;
          const config = yield* configService.load();
          const x402Config = yield* runtimeConfig.load();
          const gateList = yield* gates.list();

          const x402Resources = gateList.map(resourceFromGate);
          const x402Enabled = x402Resources.length > 0 && Boolean(x402Config.walletAddress?.trim());
          const stripeEnabled = Boolean(runEnv.STRIPE_SECRET_KEY?.trim());
          const paymentMethods: PaymentsWellKnownDocument["payment_methods"] = [];

          if (x402Enabled || x402Resources.length > 0) {
            paymentMethods.push({
              type: "x402",
              enabled: x402Enabled,
              x402_version: X402_VERSION,
              scheme: x402Config.scheme,
              network: x402Config.network,
              asset: "USDC",
              asset_contract: x402Config.usdcAsset,
              pay_to: x402Config.walletAddress,
              facilitator: x402Config.facilitatorUrl,
              resources: x402Resources,
            });
          }

          if (stripeEnabled || config.plan) {
            paymentMethods.push({
              type: "stripe",
              enabled: stripeEnabled,
              billing: runEnv.STRIPE_METER_EVENT_NAME?.trim() ? "metered" : "subscription",
              plans: Object.keys(CLAWQL_PLANS),
              meter_event_name:
                config.stripe?.meterEventName?.trim() ||
                runEnv.STRIPE_METER_EVENT_NAME?.trim() ||
                undefined,
            });
          }

          if (isAp2Enabled(runEnv)) {
            paymentMethods.push({
              type: "ap2",
              enabled: true,
              protocol: "ap2",
              mandate_types: ["mandate.payment.1", "mandate.payment.open.1"],
              require: isAp2Required(runEnv),
              documentation: "https://ap2-protocol.org/",
            });
          }

          if (isAcpEnabled(runEnv)) {
            paymentMethods.push({
              type: "acp",
              enabled: true,
              protocol: "acp",
              checkout: "sessions",
              payment_provider: "stripe",
              documentation: "https://developers.openai.com/commerce/specs/checkout",
            });
          }

          if (isPaypalEnabled(runEnv)) {
            paymentMethods.push({
              type: "paypal",
              enabled: true,
              api_base: paypalApiBase(runEnv),
              documentation: "https://developer.paypal.com/docs/api/orders/v2/",
            });
          }

          if (isAdyenEnabled(runEnv)) {
            paymentMethods.push({
              type: "adyen",
              enabled: true,
              environment: adyenEnvironment(runEnv),
              merchant_account: adyenMerchantAccount(runEnv),
              documentation: "https://docs.adyen.com/online-payments/",
            });
          }

          const defaultMethod: PaymentsWellKnownDocument["default"] =
            x402Enabled && x402Resources.length > 0 ? "x402" : stripeEnabled ? "stripe" : null;

          return {
            version: "1",
            server_name: options.serverName?.trim() || "ClawQL",
            documentation:
              options.documentationUrl?.trim() ||
              "https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/payments/clawql-payments.md",
            issue: "https://github.com/danielsmithdevelopment/ClawQL/issues/88",
            payment_methods: paymentMethods,
            default: defaultMethod,
            updated_at: new Date().toISOString(),
          };
        });

      return PaymentsDiscoveryService.of({
        buildDocument,
        renderJson: (options) =>
          buildDocument(options).pipe(Effect.map((doc) => `${JSON.stringify(doc, null, 2)}\n`)),
      });
    })
  );
}

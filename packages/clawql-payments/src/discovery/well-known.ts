import { CLAWQL_PLANS } from "../plans/index.js";
import { loadPaymentsConfig } from "../config/store.js";
import { listX402Gates } from "../x402/gate.js";
import { loadX402RuntimeConfig } from "../x402/config.js";
import { X402_VERSION } from "../x402/types.js";

export type PaymentsWellKnownResource = {
  kind: "http" | "mcp_tool";
  id: string;
  price_usdc: number;
  asset: string;
};

export type PaymentsWellKnownMethod = {
  type: "x402" | "stripe";
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

export type PaymentsWellKnownDocument = {
  version: string;
  server_name: string;
  documentation: string;
  issue?: string;
  payment_methods: Array<PaymentsWellKnownX402Method | PaymentsWellKnownStripeMethod>;
  default: "x402" | "stripe" | null;
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

export async function buildPaymentsWellKnownDocument(
  options: BuildPaymentsWellKnownOptions = {}
): Promise<PaymentsWellKnownDocument> {
  const env = options.env ?? process.env;
  const config = await loadPaymentsConfig(env);
  const x402Config = await loadX402RuntimeConfig(env);
  const gates = await listX402Gates(env);

  const x402Resources = gates.map(resourceFromGate);
  const x402Enabled = x402Resources.length > 0 && Boolean(x402Config.walletAddress?.trim());

  const stripeEnabled = Boolean(env.STRIPE_SECRET_KEY?.trim());
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
      billing: env.STRIPE_METER_EVENT_NAME?.trim() ? "metered" : "subscription",
      plans: Object.keys(CLAWQL_PLANS),
      meter_event_name:
        config.stripe?.meterEventName?.trim() || env.STRIPE_METER_EVENT_NAME?.trim() || undefined,
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
}

export async function renderPaymentsWellKnownJson(
  options: BuildPaymentsWellKnownOptions = {}
): Promise<string> {
  const doc = await buildPaymentsWellKnownDocument(options);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

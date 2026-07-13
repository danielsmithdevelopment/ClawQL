import type { X402Gate } from "./gate.js";
import type { X402PaymentRequired, X402PaymentRequirements, X402ResourceInfo } from "./types.js";
import { X402_VERSION } from "./types.js";
import { usdcAtomicAmount, type X402RuntimeConfig } from "./x402-runtime-config-service.js";

export function buildPaymentRequirements(input: {
  gate: X402Gate;
  config: X402RuntimeConfig;
  resourceUrl: string;
}): X402PaymentRequirements {
  const payTo = input.config.walletAddress;
  if (!payTo?.trim()) {
    throw new Error(
      "x402 wallet address is not configured — run clawql payments x402 wallet setup"
    );
  }

  return {
    scheme: input.config.scheme,
    network: input.config.network,
    amount: usdcAtomicAmount(input.gate.price),
    asset: input.config.usdcAsset,
    payTo,
    maxTimeoutSeconds: input.config.maxTimeoutSeconds,
    extra: {
      name: input.gate.asset,
      version: "2",
    },
  };
}

export function buildPaymentRequired(input: {
  gate: X402Gate;
  resource: X402ResourceInfo;
  config: X402RuntimeConfig;
}): X402PaymentRequired {
  const requirements = buildPaymentRequirements({
    gate: input.gate,
    config: input.config,
    resourceUrl: input.resource.url,
  });

  return {
    x402Version: X402_VERSION,
    error: "PAYMENT-SIGNATURE header is required",
    resource: input.resource,
    accepts: [requirements],
    extensions: {
      facilitator: input.config.facilitatorUrl,
    },
  };
}

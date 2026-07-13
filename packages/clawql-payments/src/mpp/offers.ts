import type { X402PaymentRequired } from "../x402/types.js";
import type { X402Gate } from "../x402/gate.js";
import type { X402RuntimeConfig } from "../x402/x402-runtime-config-service.js";
import { usdcAtomicAmount } from "../x402/x402-runtime-config-service.js";
import { appendFinanceOffers } from "./providers.js";
import {
  MPP_METHOD_STRIPE,
  MPP_METHOD_X402,
  type MppPaymentInfo,
  type MppPaymentOffer,
} from "./types.js";

export function buildX402Offer(input: {
  gate: X402Gate;
  config: X402RuntimeConfig;
}): MppPaymentOffer | undefined {
  const payTo = input.config.walletAddress?.trim();
  if (!payTo) return undefined;

  return {
    intent: "charge",
    method: MPP_METHOD_X402,
    amount: usdcAtomicAmount(input.gate.price),
    currency: input.config.usdcAsset,
    description: `x402 payment for ${input.gate.resource}`,
  };
}

export function buildStripeOffer(input?: {
  metered?: boolean;
  description?: string;
}): MppPaymentOffer {
  return {
    intent: "charge",
    method: MPP_METHOD_STRIPE,
    amount: null,
    currency: "usd",
    description:
      input?.description ??
      (input?.metered
        ? "Stripe metered billing — amount varies by usage."
        : "Stripe subscription billing."),
  };
}

export function buildOffersForGate(input: {
  gate: X402Gate;
  config: X402RuntimeConfig;
  stripeEnabled?: boolean;
  stripeMetered?: boolean;
  env?: NodeJS.ProcessEnv;
}): MppPaymentOffer[] {
  const offers: MppPaymentOffer[] = [];
  const x402 = buildX402Offer({ gate: input.gate, config: input.config });
  if (x402) offers.push(x402);
  if (input.stripeEnabled) {
    offers.push(
      buildStripeOffer({
        metered: input.stripeMetered,
        description: `Stripe billing for ${input.gate.resource}`,
      })
    );
  }
  return appendFinanceOffers({
    offers,
    env: input.env,
    resource: input.gate.resource,
  });
}

export function toPaymentInfo(offers: MppPaymentOffer[]): MppPaymentInfo {
  return { offers };
}

export function paymentInfoFromOffers(offers: MppPaymentOffer[]): MppPaymentInfo | undefined {
  if (offers.length === 0) return undefined;
  return toPaymentInfo(offers);
}

/** Derive MPP offers from a runtime x402 PaymentRequired body (for 402/MCP enrichment). */
export function offersFromX402Required(
  body: X402PaymentRequired,
  stripeEnabled = false,
  env?: NodeJS.ProcessEnv
): MppPaymentOffer[] {
  const offers: MppPaymentOffer[] = [];
  const accept = body.accepts[0];
  if (accept) {
    offers.push({
      intent: "charge",
      method: MPP_METHOD_X402,
      amount: accept.amount,
      currency: accept.asset,
      description: body.resource.description,
    });
  }
  if (stripeEnabled) {
    offers.push(buildStripeOffer({ metered: true }));
  }
  return appendFinanceOffers({
    offers,
    env,
    resource: body.resource.url,
  });
}

import { randomUUID } from "node:crypto";
import type { X402PaymentRequired } from "../x402/types.js";
import type { MppPaymentChallenge, MppPaymentOffer } from "./types.js";
import { MPP_METHOD_STRIPE, MPP_METHOD_X402 } from "./types.js";

export function buildChallengesFromOffers(input: {
  offers: MppPaymentOffer[];
  resource: string;
  x402Body?: X402PaymentRequired;
}): MppPaymentChallenge[] {
  return input.offers.map((offer) => {
    const extensions: Record<string, unknown> = {};
    if (offer.method === MPP_METHOD_X402 && input.x402Body) {
      extensions.x402 = input.x402Body;
      extensions.protocol = "x402";
    }
    if (offer.method === MPP_METHOD_STRIPE) {
      extensions.protocol = "stripe";
      extensions.billing = offer.amount === null ? "metered_or_dynamic" : "fixed";
    }

    return {
      id: randomUUID(),
      intent: offer.intent,
      method: offer.method,
      amount: offer.amount,
      currency: offer.currency,
      resource: input.resource,
      description: offer.description,
      extensions,
    };
  });
}

/** MPP HTTP 402 JSON body (Payment auth scheme + x402 compatibility). */
export function buildMppPaymentRequiredBody(input: {
  resource: string;
  challenges: MppPaymentChallenge[];
  x402Body?: X402PaymentRequired;
}): Record<string, unknown> {
  const payment = input.challenges.map((challenge) => {
    if (challenge.method === MPP_METHOD_X402 && input.x402Body) {
      return {
        protocol: "x402",
        paymentRequired: input.x402Body,
        challenge,
      };
    }
    return {
      protocol: challenge.method,
      challenge,
    };
  });

  return {
    error: "payment_required",
    message: "Payment required (MPP)",
    resource: input.resource,
    payment,
    ...(input.x402Body ? { x402: input.x402Body, x402Version: input.x402Body.x402Version } : {}),
  };
}

import type { X402PaymentRequired } from "../x402/types.js";
import { paymentRequiredHeaders as x402PaymentRequiredHeaders } from "../x402/enforce.js";
import { buildChallengesFromOffers, buildMppPaymentRequiredBody } from "./challenge.js";
import type { MppPaymentChallenge, MppPaymentOffer } from "./types.js";

export function mppWwwAuthenticateHeader(challenges: MppPaymentChallenge[]): string {
  const payload = Buffer.from(JSON.stringify({ challenges }), "utf8").toString("base64url");
  return `Payment challenge="${payload}"`;
}

export function mergePaymentRequiredHeaders(input: {
  x402Body: X402PaymentRequired;
  offers: MppPaymentOffer[];
  resource: string;
}): Record<string, string> {
  const challenges = buildChallengesFromOffers({
    offers: input.offers,
    resource: input.resource,
    x402Body: input.x402Body,
  });
  const mppBody = buildMppPaymentRequiredBody({
    resource: input.resource,
    challenges,
    x402Body: input.x402Body,
  });

  return {
    ...x402PaymentRequiredHeaders(input.x402Body),
    "WWW-Authenticate": mppWwwAuthenticateHeader(challenges),
    "Payment-Required": Buffer.from(JSON.stringify(mppBody), "utf8").toString("base64"),
    "Access-Control-Expose-Headers":
      "PAYMENT-REQUIRED, PAYMENT-RESPONSE, Payment-Required, WWW-Authenticate, Authorization",
  };
}

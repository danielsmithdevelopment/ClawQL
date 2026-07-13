import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  X402FacilitatorService,
  type X402FacilitatorSettleInput,
  type X402FacilitatorSettleResult,
  type X402FacilitatorVerifyInput,
  type X402FacilitatorVerifyResult,
} from "./x402-facilitator-service.js";
import type { X402PaymentPayloadV2, X402PaymentRequirements } from "./types.js";

export type {
  X402FacilitatorVerifyInput,
  X402FacilitatorVerifyResult,
  X402FacilitatorSettleInput,
  X402FacilitatorSettleResult,
};

export async function verifyViaFacilitator(
  input: X402FacilitatorVerifyInput
): Promise<X402FacilitatorVerifyResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const facilitator = yield* X402FacilitatorService;
      return yield* facilitator.verify(input);
    }),
    input.env
  );
}

export async function settleViaFacilitator(
  input: X402FacilitatorSettleInput
): Promise<X402FacilitatorSettleResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const facilitator = yield* X402FacilitatorService;
      return yield* facilitator.settle(input);
    }),
    input.env
  );
}

export async function verifyViaConfiguredFacilitator(input: {
  paymentPayload: X402PaymentPayloadV2;
  paymentRequirements: X402PaymentRequirements;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<X402FacilitatorVerifyResult> {
  const { loadX402RuntimeConfig } = await import("./config.js");
  const config = await loadX402RuntimeConfig(input.env);
  if (!config.facilitatorUrl) {
    return { verified: false, reason: "x402 facilitator URL is not configured" };
  }
  return verifyViaFacilitator({
    facilitatorUrl: config.facilitatorUrl,
    paymentPayload: input.paymentPayload,
    paymentRequirements: input.paymentRequirements,
    env: input.env,
    fetchImpl: input.fetchImpl,
  });
}

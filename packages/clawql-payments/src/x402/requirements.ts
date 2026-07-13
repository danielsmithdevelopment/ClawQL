import { Effect } from "effect";
import type { X402Gate } from "./gate.js";
import type { X402PaymentRequired } from "./types.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { X402RuntimeConfigService } from "./x402-runtime-config-service.js";
import { buildPaymentRequired } from "./payment-requirements.js";

export { buildPaymentRequirements, buildPaymentRequired } from "./payment-requirements.js";

export async function buildPaymentRequiredForGate(input: {
  gate: X402Gate;
  requestUrl: string;
  env?: NodeJS.ProcessEnv;
}): Promise<X402PaymentRequired> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const runtime = yield* X402RuntimeConfigService;
      const config = yield* runtime.load();
      return buildPaymentRequired({
        gate: input.gate,
        config,
        resource: {
          url: input.requestUrl,
          description: `Payment required for ${input.gate.resource}`,
          mimeType: "application/json",
        },
      });
    }),
    input.env
  );
}

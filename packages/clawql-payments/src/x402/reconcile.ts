import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  X402EnforcementService,
  type X402Settlement,
} from "./x402-enforcement-service.js";
import type { X402PaymentProof } from "./verify.js";

export type { X402Settlement };

export async function reconcileX402Settlement(input: {
  tenantId: string;
  resource: string;
  amountUsdc: number;
  proof: X402PaymentProof;
  correlationId?: string;
}): Promise<X402Settlement> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const enforcement = yield* X402EnforcementService;
      return yield* enforcement.reconcileSettlement(input);
    })
  );
}

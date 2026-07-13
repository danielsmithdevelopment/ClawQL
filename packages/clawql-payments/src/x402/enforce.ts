import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  X402EnforcementService,
  type EnforceX402GateInput,
  type X402EnforceResult,
} from "./x402-enforcement-service.js";
import type { X402PaymentRequired } from "./types.js";
import { usdcAtomicAmount } from "./x402-runtime-config-service.js";

export type { X402EnforceResult, EnforceX402GateInput };

export async function enforceX402Gate(input: EnforceX402GateInput): Promise<X402EnforceResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const enforcement = yield* X402EnforcementService;
      return yield* enforcement.enforceGate(input);
    }),
    input.env
  );
}

export function resolveX402ResourceFromRequest(input: {
  path: string;
  toolHeader?: string;
}): string {
  if (input.toolHeader?.trim()) {
    return `tool:${input.toolHeader.trim()}`;
  }
  return input.path;
}

export function paymentRequiredHeaders(body: X402PaymentRequired): Record<string, string> {
  return {
    "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(body)).toString("base64"),
    "Content-Type": "application/json",
  };
}

export function formatAtomicUsdc(amount: string): number {
  return Number.parseInt(amount, 10) / 1_000_000;
}

export { usdcAtomicAmount };

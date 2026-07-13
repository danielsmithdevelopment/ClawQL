import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import type { X402Scheme } from "./types.js";
import {
  isX402EnforcementActive,
  resolveFacilitatorAuthHeaders,
  resolveFacilitatorEndpoint,
  usdcAtomicAmount,
  X402RuntimeConfigService,
  type X402RuntimeConfig,
} from "./x402-runtime-config-service.js";

export {
  isX402EnforcementActive,
  usdcAtomicAmount,
  resolveFacilitatorEndpoint,
  resolveFacilitatorAuthHeaders,
  type X402RuntimeConfig,
};

export async function loadX402RuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<X402RuntimeConfig> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const runtime = yield* X402RuntimeConfigService;
      return yield* runtime.load();
    }),
    env
  );
}

export type { X402Scheme };

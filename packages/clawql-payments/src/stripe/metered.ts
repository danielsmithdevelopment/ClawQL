import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { StripeMeterService, type MeteredUsageInput } from "./stripe-meter-service.js";

export type { MeteredUsageInput };

export async function reportMeteredUsage(
  input: MeteredUsageInput
): Promise<{ id: string; value: number }> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const meter = yield* StripeMeterService;
      return yield* meter.reportMeteredUsage(input);
    }),
    input.env
  );
}

import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  StripeMeterService,
  buildInferenceMeterIdentifier,
  isStripeMeterReportingActive,
  type ReportInferenceMeterUsageInput,
  type ReportInferenceMeterUsageResult,
  type StripeMeterConfig,
} from "./stripe-meter-service.js";

export {
  buildInferenceMeterIdentifier,
  isStripeMeterReportingActive,
  type ReportInferenceMeterUsageInput,
  type ReportInferenceMeterUsageResult,
  type StripeMeterConfig,
};

export async function resolveStripeMeterConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<StripeMeterConfig | null> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const meter = yield* StripeMeterService;
      return yield* meter.resolveMeterConfig(env);
    }),
    env
  );
}

export async function reportInferenceMeterUsageIfEnabled(
  input: ReportInferenceMeterUsageInput
): Promise<ReportInferenceMeterUsageResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const meter = yield* StripeMeterService;
      return yield* meter.reportInferenceUsageIfEnabled(input);
    }),
    input.env
  );
}

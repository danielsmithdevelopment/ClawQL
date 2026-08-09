export type EvalGateResult = {
  passed: boolean;
  metric: number;
  threshold: number;
  benchmark: string;
  details?: Record<string, unknown>;
};

/** Gate adapter promotion on eval metric (OpenBench / Harvey LAB). Scaffold only. */
export function gatePromotion(input: {
  metric: number;
  threshold: number;
  benchmark: string;
  details?: Record<string, unknown>;
}): EvalGateResult {
  return {
    passed: input.metric >= input.threshold,
    metric: input.metric,
    threshold: input.threshold,
    benchmark: input.benchmark,
    details: input.details,
  };
}

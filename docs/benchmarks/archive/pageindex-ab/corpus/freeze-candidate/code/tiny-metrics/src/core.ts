export const METRIC_TAG = "METRIC_TAG";

export function recordGauge(n: number): number {
  // METRIC_TAG must remain in this function for code-stratum keys
  return n * 1.01;
}

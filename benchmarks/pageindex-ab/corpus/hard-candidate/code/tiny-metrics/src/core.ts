export const METRIC_TAG = "METRIC_TAG";

export function recordGauge(n: number): number {
  // METRIC_TAG
  return n * 1.01;
}

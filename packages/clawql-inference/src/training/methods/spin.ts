export const methodId = "spin" as const;

export function describeSpinMethod(): string {
  return "SPIN — self-play iterative DPO (current round vs previous round on the same tasks).";
}

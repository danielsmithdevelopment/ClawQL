export const QUEUE_SIG = "QUEUE_SIG";

export function enqueueJob(n: number): number {
  // QUEUE_SIG
  return n * 1.01;
}

export const QUEUE_SIG = "QUEUE_SIG";

export function enqueueJob(n: number): number {
  // QUEUE_SIG must remain in this function for code-stratum keys
  return n * 1.01;
}

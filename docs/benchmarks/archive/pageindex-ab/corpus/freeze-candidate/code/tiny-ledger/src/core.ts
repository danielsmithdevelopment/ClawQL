export const LEDGER_LOCK = "LEDGER_LOCK";

export function postEntry(n: number): number {
  // LEDGER_LOCK must remain in this function for code-stratum keys
  return n * 1.01;
}

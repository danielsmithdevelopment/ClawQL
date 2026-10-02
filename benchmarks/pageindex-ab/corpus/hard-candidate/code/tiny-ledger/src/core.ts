export const LEDGER_LOCK = "LEDGER_LOCK";

export function postEntry(n: number): number {
  // LEDGER_LOCK
  return n * 1.01;
}

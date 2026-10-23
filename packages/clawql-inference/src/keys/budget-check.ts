/** Pure VK budget gate — no pricing / gateway imports (Ready-safe). */
export function isBudgetExceeded(spentUsd: number, budgetUsd: number | undefined): boolean {
  if (budgetUsd === undefined || budgetUsd <= 0) return false;
  return spentUsd >= budgetUsd;
}

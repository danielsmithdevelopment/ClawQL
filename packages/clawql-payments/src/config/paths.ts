import { join } from "node:path";

export function resolveClawqlHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
}

export function resolvePaymentsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveClawqlHome(env), "Payments");
}

export function resolvePaymentsConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "payments.json");
}

export function resolveX402GatesPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "x402-gates.json");
}

export function resolveUsagePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "usage.json");
}

export function resolvePaymentAuditJsonlPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "audit.jsonl");
}

export function resolvePaymentAuditMetaPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "audit.meta.json");
}

/** Creator payout destination preferences (bank vs USDC wallet). */
export function resolvePayoutPreferencesPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "payout-preferences.json");
}

export function resolveCreditsLedgerPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "credits-ledger.json");
}

/** Agent compensation ledger (credits + funds balances). */
export function resolveAgentAccountsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "agent-accounts.json");
}

/**
 * File-backed PENDING_ACTIONS store (DAOS 2PC staging until NATS KV PEP lands).
 * One JSON file per action_id.
 */
export function resolvePendingActionsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "pending-actions");
}

/** Append-only deduction event outbox (post-counter NATS/analytics feed). */
export function resolveDeductionOutboxPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "deduction-outbox.jsonl");
}

/** Money requests / invoices (file-backed; invite tokens for off-platform email). */
export function resolveMoneyRequestsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "money-requests.json");
}

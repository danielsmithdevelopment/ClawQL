import type { PaymentWormEntry } from "./events.js";
import type { PaymentWormRecord, PaymentAuditVerifyResult } from "./chain.js";

export type PaymentAuditStoreMode = "jsonl" | "memory";

export type PaymentAuditStore = {
  append(entry: PaymentWormEntry): PaymentWormRecord;
  list(limit?: number): PaymentWormEntry[];
  listRecords(limit?: number): PaymentWormRecord[];
  verify(): PaymentAuditVerifyResult;
  reset(): void;
};

export function resolvePaymentAuditStoreMode(
  env: NodeJS.ProcessEnv = process.env
): PaymentAuditStoreMode {
  const raw = env.CLAWQL_PAYMENTS_AUDIT_STORE?.trim().toLowerCase();
  if (raw === "jsonl" || raw === "memory") return raw;
  if (env.VITEST === "true" || env.NODE_ENV === "test") return "memory";
  return "jsonl";
}

export function isPaymentAuditFsyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_PAYMENTS_AUDIT_FSYNC?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

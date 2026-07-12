import type { PaymentWormEntry } from "./events.js";
import type { PaymentWormRecord, PaymentAuditVerifyResult } from "./chain.js";

export type PaymentAuditStoreMode = "jsonl" | "memory" | "postgres";

export type PaymentAuditStore = {
  append(entry: PaymentWormEntry): Promise<PaymentWormRecord>;
  list(limit?: number): Promise<PaymentWormEntry[]>;
  listRecords(limit?: number): Promise<PaymentWormRecord[]>;
  verify(): Promise<PaymentAuditVerifyResult>;
  reset(): Promise<void>;
};

export function resolvePaymentAuditStoreMode(
  env: NodeJS.ProcessEnv = process.env
): PaymentAuditStoreMode {
  const raw = env.CLAWQL_PAYMENTS_AUDIT_STORE?.trim().toLowerCase();
  if (raw === "jsonl" || raw === "memory" || raw === "postgres") return raw;
  if (env.VITEST === "true" || env.NODE_ENV === "test") return "memory";
  return "jsonl";
}

export function isPaymentAuditFsyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_PAYMENTS_AUDIT_FSYNC?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}

export function isPaymentAuditLokiPushEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.CLAWQL_PAYMENTS_LOKI_PUSH?.trim();
  if (flag === "0" || flag?.toLowerCase() === "false") return false;
  if (flag === "1" || flag?.toLowerCase() === "true") return true;
  const url = env.CLAWQL_LOKI_PUSH_URL?.trim();
  if (!url) return false;
  const globalFlag = env.CLAWQL_ENABLE_LOKI_PUSH?.trim();
  if (globalFlag === "0" || globalFlag?.toLowerCase() === "false") return false;
  return true;
}

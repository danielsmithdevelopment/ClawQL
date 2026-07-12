import { getDefaultAuditRingBuffer } from "clawql-core";
import type { PaymentAuditVerifyResult } from "./chain.js";
import type { PaymentWormEntry } from "./events.js";
import { getPaymentAuditStore, resetPaymentAuditStoreForTests } from "./factory.js";

export function appendPaymentWormEntry(
  entry: PaymentWormEntry,
  env: NodeJS.ProcessEnv = process.env
): void {
  getPaymentAuditStore(env).append(entry);

  // Hot in-process mirror for MCP audit ring buffer (summary-only).
  getDefaultAuditRingBuffer().append({
    ts: entry.ts,
    category: entry.category,
    action: entry.action,
    summary: entry.summary,
    correlationId: entry.correlationId,
  });
}

export function listPaymentAuditEntries(
  limit = 100,
  env: NodeJS.ProcessEnv = process.env
): PaymentWormEntry[] {
  return getPaymentAuditStore(env).list(limit);
}

export function verifyPaymentAuditLog(
  env: NodeJS.ProcessEnv = process.env
): PaymentAuditVerifyResult {
  return getPaymentAuditStore(env).verify();
}

export { resetPaymentAuditStoreForTests };

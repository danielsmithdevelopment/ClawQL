import { getDefaultAuditRingBuffer } from "clawql-core";
import type { PaymentAuditVerifyResult } from "./chain.js";
import type { PaymentWormEntry } from "./events.js";
import { getPaymentAuditStore, resetPaymentAuditStoreForTests } from "./factory.js";
import { maybePushPaymentAuditEntryToLoki } from "./loki.js";
import { isPaymentAuditLokiPushEnabled } from "./store.js";

export async function appendPaymentWormEntry(
  entry: PaymentWormEntry,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await getPaymentAuditStore(env).append(entry);

  // Hot in-process mirror for MCP audit ring buffer (summary-only).
  getDefaultAuditRingBuffer().append({
    ts: entry.ts,
    category: entry.category,
    action: entry.action,
    summary: entry.summary,
    correlationId: entry.correlationId,
  });

  if (isPaymentAuditLokiPushEnabled(env)) {
    maybePushPaymentAuditEntryToLoki(entry, env);
  }
}

export async function listPaymentAuditEntries(
  limit = 100,
  env: NodeJS.ProcessEnv = process.env
): Promise<PaymentWormEntry[]> {
  return getPaymentAuditStore(env).list(limit);
}

export async function verifyPaymentAuditLog(
  env: NodeJS.ProcessEnv = process.env
): Promise<PaymentAuditVerifyResult> {
  return getPaymentAuditStore(env).verify();
}

export { resetPaymentAuditStoreForTests };

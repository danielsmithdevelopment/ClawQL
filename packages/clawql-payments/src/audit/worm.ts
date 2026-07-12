import { getDefaultAuditRingBuffer } from "clawql-core";
import type { PaymentWormEntry } from "./events.js";

export function appendPaymentWormEntry(entry: PaymentWormEntry): void {
  getDefaultAuditRingBuffer().append({
    ts: entry.ts,
    category: entry.category,
    action: entry.action,
    summary: entry.summary,
    correlationId: entry.correlationId,
  });
}

export function listPaymentAuditEntries(limit = 100): PaymentWormEntry[] {
  const { entries } = getDefaultAuditRingBuffer().list(limit);
  return entries
    .filter((e) => e.category === "payment")
    .map((e) => ({
      ts: e.ts,
      category: "payment" as const,
      action: e.action as PaymentWormEntry["action"],
      summary: e.summary,
      correlationId: e.correlationId,
      payload: {
        provider: "stripe" as const,
        tenant_id: "unknown",
      },
    }));
}

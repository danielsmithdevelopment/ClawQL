import { describe, expect, it } from "vitest";
import {
  PAYMENT_AUDIT_GENESIS_HASH,
  hashPaymentAuditLink,
  sealPaymentWormRecord,
  verifyPaymentAuditChain,
} from "./chain.js";
import { buildStripeInvoicePaidEntry } from "./events.js";

describe("payment audit hash chain", () => {
  it("seals records with deterministic hash", () => {
    const entry = buildStripeInvoicePaidEntry({
      tenantId: "tenant-a",
      amountUsd: 12.5,
      plan: "pro",
      correlationId: "corr-1",
    });
    entry.ts = "2026-07-12T00:00:00.000Z";

    const record = sealPaymentWormRecord({
      entry,
      seq: 1,
      prev_hash: PAYMENT_AUDIT_GENESIS_HASH,
    });

    expect(record.prev_hash).toBe(PAYMENT_AUDIT_GENESIS_HASH);
    expect(record.hash).toBe(hashPaymentAuditLink(record));
  });

  it("verifyPaymentAuditChain passes for valid chain", () => {
    const firstEntry = buildStripeInvoicePaidEntry({
      tenantId: "tenant-a",
      amountUsd: 1,
    });
    firstEntry.ts = "2026-07-12T00:00:00.000Z";
    const secondEntry = buildStripeInvoicePaidEntry({
      tenantId: "tenant-b",
      amountUsd: 2,
    });
    secondEntry.ts = "2026-07-12T00:00:01.000Z";

    const first = sealPaymentWormRecord({
      entry: firstEntry,
      seq: 1,
      prev_hash: PAYMENT_AUDIT_GENESIS_HASH,
    });
    const second = sealPaymentWormRecord({
      entry: secondEntry,
      seq: 2,
      prev_hash: first.hash,
    });

    const result = verifyPaymentAuditChain([first, second]);
    expect(result.ok).toBe(true);
    expect(result.records).toBe(2);
    expect(result.head_hash).toBe(second.hash);
  });

  it("verifyPaymentAuditChain detects tampering", () => {
    const entry = buildStripeInvoicePaidEntry({
      tenantId: "tenant-a",
      amountUsd: 99,
    });
    entry.ts = "2026-07-12T00:00:00.000Z";
    const record = sealPaymentWormRecord({
      entry,
      seq: 1,
      prev_hash: PAYMENT_AUDIT_GENESIS_HASH,
    });
    record.payload.amount_usd = 0.01;

    const result = verifyPaymentAuditChain([record]);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

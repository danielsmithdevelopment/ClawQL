import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import { buildStripeInvoicePaidEntry, buildX402PaymentReceivedEntry } from "./events.js";
import { createJsonlPaymentAuditStore } from "./jsonl-store.js";
import {
  appendPaymentWormEntry,
  listPaymentAuditEntries,
  resetPaymentAuditStoreForTests,
  verifyPaymentAuditLog,
} from "./worm.js";
import { buildSpendReport } from "./reconcile.js";

describe("durable payment audit store", () => {
  let tempHome: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "clawql-payments-audit-"));
    env = {
      ...process.env,
      CLAWQL_HOME: tempHome,
      CLAWQL_PAYMENTS_AUDIT_STORE: "jsonl",
      CLAWQL_PAYMENTS_AUDIT_FSYNC: "0",
    };
    resetDefaultAuditRingBufferForTests();
    resetPaymentAuditStoreForTests(env);
  });

  afterEach(() => {
    resetPaymentAuditStoreForTests(env);
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("persists full payload to audit.jsonl", () => {
    appendPaymentWormEntry(
      buildStripeInvoicePaidEntry({
        tenantId: "acme",
        amountUsd: 42.5,
        plan: "team",
        correlationId: "inv_123",
      }),
      env
    );

    const entries = listPaymentAuditEntries(10, env);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.payload.tenant_id).toBe("acme");
    expect(entries[0]?.payload.amount_usd).toBe(42.5);
    expect(entries[0]?.payload.plan).toBe("team");
  });

  it("verifies hash chain after restart (new store instance)", () => {
    appendPaymentWormEntry(
      buildX402PaymentReceivedEntry({
        tenantId: "default",
        amountUsdc: 0.001,
        resource: "/v1/chat/completions",
        correlationId: "pay-1",
      }),
      env
    );

    const store = createJsonlPaymentAuditStore(env);
    const result = store.verify();
    expect(result.ok).toBe(true);
    expect(result.records).toBe(1);
  });

  it("buildSpendReport uses persisted payload amounts", () => {
    appendPaymentWormEntry(buildStripeInvoicePaidEntry({ tenantId: "t1", amountUsd: 10 }), env);
    appendPaymentWormEntry(
      buildX402PaymentReceivedEntry({
        tenantId: "t2",
        amountUsdc: 0.5,
        resource: "tool:search",
      }),
      env
    );

    const report = buildSpendReport(listPaymentAuditEntries(100, env), "provider");
    expect(report.totalUsd).toBe(10);
    expect(report.totalUsdc).toBe(0.5);
    expect(report.rows.some((r) => r.provider === "stripe" && r.amountUsd === 10)).toBe(true);
    expect(report.rows.some((r) => r.provider === "x402" && r.amountUsdc === 0.5)).toBe(true);
  });

  it("verifyPaymentAuditLog returns ok for intact chain", () => {
    appendPaymentWormEntry(buildStripeInvoicePaidEntry({ tenantId: "t1", amountUsd: 1 }), env);
    appendPaymentWormEntry(buildStripeInvoicePaidEntry({ tenantId: "t2", amountUsd: 2 }), env);

    const result = verifyPaymentAuditLog(env);
    expect(result.ok).toBe(true);
    expect(result.records).toBe(2);
  });
});

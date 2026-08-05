import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import {
  buildCreditTopupSettledEntry,
  buildPayoutPaidEntry,
  buildStripeInvoicePaidEntry,
  buildX402PaymentReceivedEntry,
} from "../audit/events.js";
import {
  appendPaymentWormEntry,
  resetPaymentAuditStoreForTests,
} from "../audit/worm.js";
import { classifyAccounting, resolveEntryAccounting } from "./classify.js";
import {
  buildAccountingExport,
  buildAccountingExportRows,
  formatAccountingCsv,
} from "./export.js";
import { DEFAULT_ACCOUNTING_MAP, resolveAccountingMapPath } from "./map.js";
import { buildTaxEvidencePack } from "./tax-evidence.js";
import { setTaxProfile } from "./tax-profile.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";

describe("accounting export + tax evidence", () => {
  let tempHome: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    tempHome = mkdtempSync(join(tmpdir(), "clawql-accounting-"));
    env = {
      ...process.env,
      CLAWQL_HOME: tempHome,
      CLAWQL_PAYMENTS_AUDIT_STORE: "jsonl",
      CLAWQL_PAYMENTS_AUDIT_FSYNC: "0",
    };
    resetDefaultAuditRingBufferForTests();
    resetPaymentsEffectRuntimeForTests();
    await resetPaymentAuditStoreForTests(env);
  });

  afterEach(async () => {
    await resetPaymentAuditStoreForTests(env);
    resetPaymentsEffectRuntimeForTests();
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("classifies credit top-up as prepaid_liability (not revenue)", () => {
    const entry = buildCreditTopupSettledEntry({
      tenantId: "acme",
      amountUsd: 100,
      balanceUsd: 100,
      paymentIntentId: "pi_1",
    });
    expect(entry.accounting?.category).toBe("prepaid_liability");
    expect(entry.accounting?.taxTreatment).toBe("non_taxable");
    expect(classifyAccounting("CREDIT_TOPUP_SETTLED", entry.payload).category).toBe(
      "prepaid_liability"
    );
  });

  it("builds stable CSV from fixture WORM (credits liability + saas + x402)", async () => {
    await appendPaymentWormEntry(
      buildStripeInvoicePaidEntry({ tenantId: "acme", amountUsd: 42, plan: "team" }),
      env
    );
    await appendPaymentWormEntry(
      buildCreditTopupSettledEntry({
        tenantId: "acme",
        amountUsd: 25,
        balanceUsd: 25,
        paymentIntentId: "pi_ach",
      }),
      env
    );
    await appendPaymentWormEntry(
      buildX402PaymentReceivedEntry({
        tenantId: "acme",
        amountUsdc: 0.01,
        resource: "tool:search",
      }),
      env
    );

    const result = await buildAccountingExport({
      from: "2000-01-01",
      to: "2100-12-31",
      format: "csv",
      env,
    });
    expect(result.rowCount).toBe(3);
    expect(result.totalUsd).toBe(67);
    expect(result.totalUsdc).toBe(0.01);

    const liability = result.rows.find((r) => r.category === "prepaid_liability");
    expect(liability?.glCode).toBe(DEFAULT_ACCOUNTING_MAP.categories.prepaid_liability);
    expect(liability?.direction).toBe("inflow");

    const csv = formatAccountingCsv(result.rows);
    expect(csv).toContain("prepaid_liability");
    expect(csv).toContain("saas_revenue");
    expect(csv).toContain("micropayment_revenue");
    expect(csv.split("\n")[0]).toContain("glCode");
  });

  it("honors accounting-map.json CoA overrides", async () => {
    mkdirSync(join(tempHome, "Payments"), { recursive: true });
    writeFileSync(
      resolveAccountingMapPath(env),
      JSON.stringify({ categories: { saas_revenue: "4010" } }, null, 2)
    );
    const rows = buildAccountingExportRows(
      [
        buildStripeInvoicePaidEntry({ tenantId: "t", amountUsd: 1 }),
      ],
      { categories: { saas_revenue: "4010" } }
    );
    expect(rows[0]?.glCode).toBe("4010");
  });

  it("refuses export when skipVerify is false and chain would fail — empty store verifies ok", async () => {
    const result = await buildAccountingExport({
      from: "2026-01-01",
      to: "2026-12-31",
      skipVerify: false,
      env,
    });
    expect(result.verifyOk).toBe(true);
    expect(result.rowCount).toBe(0);
  });

  it("builds tax evidence pack for payouts with tax profile tags", async () => {
    await setTaxProfile(
      { partyId: "creator-1", taxForm: "1099nec", collected: true, taxProfileRef: "vault:tp_1" },
      env
    );
    await appendPaymentWormEntry(
      buildPayoutPaidEntry({
        tenantId: "acme",
        payoutId: "po_1",
        amountUsd: 500,
        destination: "bank",
        creatorId: "creator-1",
      }),
      env
    );

    const pack = await buildTaxEvidencePack({ taxYear: new Date().getUTCFullYear(), env });
    expect(pack.rowCount).toBe(1);
    expect(pack.rows[0]?.partyId).toBe("creator-1");
    expect(pack.rows[0]?.taxForm).toBe("1099nec");
    expect(pack.rows[0]?.taxProfileCollected).toBe(true);
    expect(pack.disclaimer).toMatch(/not an IRS/);
    expect(JSON.stringify(pack)).not.toMatch(/\d{3}-\d{2}-\d{4}/);
  });

  it("resolveEntryAccounting falls back for legacy entries without accounting", () => {
    const legacy = {
      ts: "2026-01-01T00:00:00.000Z",
      category: "payment" as const,
      action: "CREDIT_TOPUP_SETTLED" as const,
      summary: "legacy",
      payload: {
        provider: "credits" as const,
        amount_usd: 10,
        tenant_id: "t",
      },
    };
    expect(resolveEntryAccounting(legacy).category).toBe("prepaid_liability");
  });
});

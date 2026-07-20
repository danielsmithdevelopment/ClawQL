import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listPaymentAuditEntries, resetPaymentAuditStoreForTests } from "../audit/worm.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { OfframpWebhookService } from "./offramp-webhook-service.js";
import { signMoonpayWebhookV2, signTransakWebhookJwt } from "./webhook-verify.js";

describe("OfframpWebhookService", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-offramp-wh-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.MOONPAY_WEBHOOK_SECRET = "moon_wh_secret";
    process.env.TRANSAK_ACCESS_TOKEN = "transak_token";
    resetPaymentsEffectRuntimeForTests();
    await resetPaymentAuditStoreForTests();
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.MOONPAY_WEBHOOK_SECRET;
    delete process.env.TRANSAK_ACCESS_TOKEN;
    await rm(home, { recursive: true, force: true });
  });

  it("settles MoonPay sell completed into OFFRAMP_COMPLETED", async () => {
    const rawBody = JSON.stringify({
      type: "sell_transaction_updated",
      data: { id: "sell_abc", status: "completed", baseCurrencyAmount: 40 },
    });
    const signature = signMoonpayWebhookV2(rawBody, "moon_wh_secret");
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const wh = yield* OfframpWebhookService;
        return yield* wh.processMoonpay({ rawBody, signatureHeader: signature });
      })
    );
    expect(result.outcome).toBe("completed");
    expect(result.transactionId).toBe("sell_abc");
    const entries = await listPaymentAuditEntries(20);
    expect(entries.some((e) => e.action === "OFFRAMP_COMPLETED")).toBe(true);
  });

  it("settles Transak ORDER_COMPLETED into OFFRAMP_COMPLETED", async () => {
    const jwt = signTransakWebhookJwt(
      { id: "tx_9", status: "COMPLETED", cryptoAmount: 12 },
      "transak_token"
    );
    const rawBody = JSON.stringify({ eventID: "ORDER_COMPLETED", data: jwt });
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const wh = yield* OfframpWebhookService;
        return yield* wh.processTransak({ rawBody });
      })
    );
    expect(result.outcome).toBe("completed");
    expect(result.transactionId).toBe("tx_9");
    const entries = await listPaymentAuditEntries(20);
    expect(entries.some((e) => e.action === "OFFRAMP_COMPLETED")).toBe(true);
  });

  it("records OFFRAMP_FAILED for MoonPay sell_transaction_failed", async () => {
    const rawBody = JSON.stringify({
      type: "sell_transaction_failed",
      data: { id: "sell_bad", status: "failed" },
    });
    const signature = signMoonpayWebhookV2(rawBody, "moon_wh_secret");
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const wh = yield* OfframpWebhookService;
        return yield* wh.process({
          provider: "moonpay",
          rawBody,
          signatureHeader: signature,
        });
      })
    );
    expect(result.outcome).toBe("failed");
    const entries = await listPaymentAuditEntries(20);
    expect(entries.some((e) => e.action === "OFFRAMP_FAILED")).toBe(true);
  });
});

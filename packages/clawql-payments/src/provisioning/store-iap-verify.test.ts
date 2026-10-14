import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import { resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { getOrg, resetOrgCreditsForTests } from "../credits/org.js";
import { CreditsLedgerService } from "../credits/ledger.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { StoreIapVerifyService } from "./store-iap-verify.js";
import { STORE_IAP_PRODUCTS } from "./store-iap-catalog.js";

describe("StoreIapVerifyService", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-store-iap-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_MANAGED_HOSTING = "1";
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_STORE_IAP_FIXTURE = "1";
    resetDefaultAuditRingBufferForTests();
    resetPaymentsEffectRuntimeForTests();
    await resetPaymentAuditStoreForTests(process.env);
    await resetOrgCreditsForTests(process.env);
    await runPaymentsEffect(
      Effect.gen(function* () {
        const ledger = yield* CreditsLedgerService;
        yield* ledger.reset();
      })
    );
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_MANAGED_HOSTING;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_STORE_IAP_FIXTURE;
    await rm(home, { recursive: true, force: true });
  });

  it("lists known store products", () => {
    expect(STORE_IAP_PRODUCTS.map((p) => p.productId)).toContain("clawql_pro_monthly");
  });

  it("provisions org from fixture store verify", async () => {
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const svc = yield* StoreIapVerifyService;
        return yield* svc.verify({
          store: "fixture",
          productId: "clawql_pro_monthly",
          purchaseToken: `fixture_iap_pro_${Date.now()}`,
          orgName: "Phone Co",
          ownerEmail: "owner@phone.co",
          env: process.env,
        });
      })
    );
    expect(result.fixture).toBe(true);
    expect(result.entitlements.planId).toBe("pro");
    expect(result.entitlements.billingMode).toBe("store_iap");
    expect(result.entitlements.productId).toBe("clawql_pro_monthly");
    const org = await getOrg(result.entitlements.orgId, process.env);
    expect(org?.storeProductId).toBe("clawql_pro_monthly");
    expect(org?.storePlatform).toBe("fixture");
  });

  it("returns entitlements for store_iap org", async () => {
    const verified = await runPaymentsEffect(
      Effect.gen(function* () {
        const svc = yield* StoreIapVerifyService;
        return yield* svc.verify({
          store: "fixture",
          productId: "clawql_team_monthly",
          purchaseToken: `fixture_iap_team_${Date.now()}`,
          orgName: "Team Phone",
          ownerEmail: "t@phone.co",
          env: process.env,
        });
      })
    );
    const ent = await runPaymentsEffect(
      Effect.gen(function* () {
        const svc = yield* StoreIapVerifyService;
        return yield* svc.entitlements(verified.entitlements.orgId);
      })
    );
    expect(ent?.planId).toBe("team");
    expect(ent?.billingMode).toBe("store_iap");
  });

  it("rejects unknown product", async () => {
    const err = await runPaymentsEffect(
      Effect.gen(function* () {
        const svc = yield* StoreIapVerifyService;
        return yield* svc.verify({
          store: "fixture",
          productId: "not_a_real_sku",
          purchaseToken: "fixture_iap_x",
          orgName: "X",
          ownerEmail: "x@y.co",
          env: process.env,
        });
      })
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeTruthy();
    const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
    expect(text).toMatch(/Unknown store product|StoreIapVerifyError|not_a_real_sku/);
  });
});

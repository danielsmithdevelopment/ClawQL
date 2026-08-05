import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLive } from "clawql-core";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
import { stripeClientLiveLayer } from "../stripe/stripe-client-service.js";
import { resetPaymentAuditStoreForTests } from "../audit/index.js";
import { AchTopupService, achTopupLiveLayer } from "./ach-topup-service.js";
import { CreditsService, creditsLiveLayer } from "./credits-service.js";
import {
  creditsLedgerLiveLayer,
  getCreditAccount,
  resetCreditsLedgerForTests,
} from "./ledger.js";
import { Layer } from "effect";

describe("credits + ACH top-up (dry-run)", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-credits-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_ACH_TOPUP_ENABLED = "1";
    process.env.CLAWQL_ACH_TOPUP_DRY_RUN = "1";
    delete process.env.STRIPE_SECRET_KEY;
    resetPaymentAuditStoreForTests();
    await resetCreditsLedgerForTests();
  });

  afterEach(async () => {
    resetPaymentAuditStoreForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_ACH_TOPUP_ENABLED;
    delete process.env.CLAWQL_ACH_TOPUP_DRY_RUN;
    await rm(home, { recursive: true, force: true });
  });

  const testLayer = () => {
    const audit = paymentAuditLiveLayer(process.env).pipe(Layer.provide(AuditLive));
    const stripe = stripeClientLiveLayer(process.env);
    const ledger = creditsLedgerLiveLayer(process.env);
    const credits = creditsLiveLayer(process.env).pipe(Layer.provide(Layer.mergeAll(audit, ledger)));
    const ach = achTopupLiveLayer(process.env).pipe(
      Layer.provide(Layer.mergeAll(audit, stripe, credits))
    );
    return Layer.mergeAll(audit, stripe, ledger, credits, ach);
  };

  it("bank-link + topup dry-run settles credits", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const ach = yield* AchTopupService;
        const link = yield* ach.createBankLinkSession({
          customerId: "cus_test",
          tenantId: "t1",
        });
        const topup = yield* ach.createTopup({
          customerId: "cus_test",
          amountUsd: 25,
          tenantId: "t1",
        });
        const credits = yield* CreditsService;
        const bal = yield* credits.getBalance("t1");
        return { link, topup, bal };
      }).pipe(Effect.provide(testLayer()))
    );

    expect(result.link.dryRun).toBe(true);
    expect(result.link.clientSecret).toContain("secret");
    expect(result.topup.settledImmediately).toBe(true);
    expect(result.topup.amountCents).toBe(2500);
    expect(result.bal.balanceCents).toBe(2500);
  });

  it("debit reduces balance and rejects overdraft", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const ach = yield* AchTopupService;
        yield* ach.createTopup({ customerId: "cus_test", amountUsd: 10, tenantId: "t1" });
        const credits = yield* CreditsService;
        yield* credits.debit({ tenantId: "t1", amountCents: 400, resource: "inference" });
      }).pipe(Effect.provide(testLayer()))
    );
    const account = await getCreditAccount("t1");
    expect(account.balanceCents).toBe(600);

    const overdraft = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.debit({ tenantId: "t1", amountCents: 9999 }).pipe(Effect.either);
      }).pipe(Effect.provide(testLayer()))
    );
    expect(overdraft._tag).toBe("Left");
    if (overdraft._tag === "Left") {
      expect(overdraft.left.reason).toMatch(/Insufficient credits/);
    }
  });
});

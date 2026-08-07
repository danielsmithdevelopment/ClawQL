import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetPaymentAuditStoreForTests } from "../audit/index.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { AchTopupService } from "./ach-topup-service.js";
import { CreditsService } from "./credits-service.js";
import { CreditsLedgerService } from "./ledger.js";

describe("credits + ACH top-up (dry-run)", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-credits-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_ACH_TOPUP_ENABLED = "1";
    process.env.CLAWQL_ACH_TOPUP_DRY_RUN = "1";
    delete process.env.STRIPE_SECRET_KEY;
    resetPaymentsEffectRuntimeForTests();
    resetPaymentAuditStoreForTests();
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    resetPaymentAuditStoreForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_ACH_TOPUP_ENABLED;
    delete process.env.CLAWQL_ACH_TOPUP_DRY_RUN;
    await rm(home, { recursive: true, force: true });
  });

  const accountBalance = (tenantId: string) =>
    runPaymentsEffect(
      Effect.gen(function* () {
        const ledger = yield* CreditsLedgerService;
        return yield* ledger.getAccount(tenantId);
      })
    );

  it("bank-link + topup dry-run settles credits", async () => {
    const result = await runPaymentsEffect(
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
      })
    );

    expect(result.link.dryRun).toBe(true);
    expect(result.link.clientSecret).toContain("secret");
    expect(result.topup.settledImmediately).toBe(true);
    expect(result.topup.amountCents).toBe(2500);
    expect(result.bal.balanceCents).toBe(2500);
  });

  it("debit reduces balance and rejects overdraft", async () => {
    await runPaymentsEffect(
      Effect.gen(function* () {
        const ach = yield* AchTopupService;
        yield* ach.createTopup({ customerId: "cus_test", amountUsd: 10, tenantId: "t1" });
        const credits = yield* CreditsService;
        yield* credits.debit({ tenantId: "t1", amountCents: 400, resource: "inference" });
      })
    );
    const account = await accountBalance("t1");
    expect(account.balanceCents).toBe(600);

    const overdraft = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.debit({ tenantId: "t1", amountCents: 9999 }).pipe(Effect.either);
      })
    );
    expect(overdraft._tag).toBe("Left");
    if (overdraft._tag === "Left") {
      expect(overdraft.left.reason).toMatch(/Insufficient credits/);
    }
  });
});

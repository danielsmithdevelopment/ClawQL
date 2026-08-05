import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { PayoutService } from "./payout-service.js";

describe("PayoutService (Stripe Connect dry-run)", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-payouts-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_PAYOUTS_ENABLED = "1";
    process.env.CLAWQL_PAYOUTS_DRY_RUN = "1";
    delete process.env.STRIPE_SECRET_KEY;
    resetPaymentsEffectRuntimeForTests();
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_PAYOUTS_ENABLED;
    delete process.env.CLAWQL_PAYOUTS_DRY_RUN;
    delete process.env.CLAWQL_TAX_PROFILE_ENFORCE;
    await rm(home, { recursive: true, force: true });
  });

  it("creates connect account, preference, and bank payout in dry-run", async () => {
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const payouts = yield* PayoutService;
        const account = yield* payouts.createConnectAccount({
          email: "creator@example.com",
          creatorId: "clipper-1",
        });
        const link = yield* payouts.createOnboardingLink({ accountId: account.id });
        const paid = yield* payouts.createPayout({
          amountUsd: 42.5,
          creatorId: "clipper-1",
          destination: "bank",
        });
        const pref = yield* payouts.getPreference("clipper-1");
        return { account, link, paid, pref };
      })
    );

    expect(result.account.dryRun).toBe(true);
    expect(result.account.id).toMatch(/^acct_dry_/);
    expect(result.link.url).toContain(result.account.id);
    expect(result.paid.status).toBe("paid");
    expect(result.paid.amountCents).toBe(4250);
    expect(result.pref?.method).toBe("bank");
  });

  it("sends USDC payouts (dry-run) with txHash", async () => {
    const wallet = "0x1111111111111111111111111111111111111111";
    const paid = await runPaymentsEffect(
      Effect.gen(function* () {
        const payouts = yield* PayoutService;
        yield* payouts.setPreference({
          creatorId: "c2",
          method: "usdc",
          usdcWallet: wallet,
        });
        return yield* payouts.createPayout({
          amountUsd: 10,
          creatorId: "c2",
          destination: "usdc",
        });
      })
    );
    expect(paid.destination).toBe("usdc");
    expect(paid.usdcWallet).toBe(wallet);
    expect(paid.amountCents).toBe(1000);
    expect(paid.dryRun).toBe(true);
    expect(paid.txHash).toMatch(/^0xdry/);
    expect(paid.status).toBe("paid"); // dry-run confirms immediately
  });

  it("blocks payout when tax profile enforce is on and profile missing", async () => {
    process.env.CLAWQL_TAX_PROFILE_ENFORCE = "1";
    resetPaymentsEffectRuntimeForTests();
    await expect(
      runPaymentsEffect(
        Effect.gen(function* () {
          const payouts = yield* PayoutService;
          return yield* payouts.createPayout({
            amountUsd: 10,
            creatorId: "no-profile",
            destination: "bank",
            connectAccountId: "acct_dry_x",
          });
        })
      )
    ).rejects.toMatchObject({ reason: expect.stringMatching(/Tax profile missing/i) });
    delete process.env.CLAWQL_TAX_PROFILE_ENFORCE;
  });
});

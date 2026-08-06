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
import { CreditsService } from "./credits-service.js";
import { CreditsLedgerService } from "./ledger.js";
import { CreditsStepUpService } from "./step-up.js";
import { generateTotp } from "./totp.js";

describe("credits P2P transfer", () => {
  let home: string;

  const seedTopup = (tenantId: string, deltaCents: number, note?: string) =>
    runPaymentsEffect(
      Effect.gen(function* () {
        const ledger = yield* CreditsLedgerService;
        yield* ledger.appendEntry({
          tenantId,
          kind: "topup_settled",
          deltaCents,
          grantSource: "topup",
          ...(note ? { note } : {}),
        });
      })
    );

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-xfer-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_CREDITS_P2P_ENABLED = "1";
    process.env.CLAWQL_CREDITS_TRANSFER_DIRECT = "1";
    delete process.env.CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP;
    resetPaymentsEffectRuntimeForTests();
    await resetPaymentAuditStoreForTests(process.env);
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_CREDITS_P2P_ENABLED;
    delete process.env.CLAWQL_CREDITS_TRANSFER_DIRECT;
    delete process.env.CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP;
    await rm(home, { recursive: true, force: true });
  });

  it("moves balance from sender to recipient and writes WORM legs", async () => {
    await seedTopup("alice", 5000, "seed");

    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        const xfer = yield* credits.transfer({
          fromTenantId: "alice",
          toTenantId: "bob",
          amountCents: 1500,
          idempotencyKey: "xfer-1",
          note: "lunch money",
        });
        const alice = yield* credits.getBalance("alice");
        const bob = yield* credits.getBalance("bob");
        return { xfer, alice, bob };
      })
    );

    expect(result.xfer.alreadyExisted).toBe(false);
    expect(result.xfer.amountCents).toBe(1500);
    expect(result.alice.balanceCents).toBe(3500);
    expect(result.bob.balanceCents).toBe(1500);
    expect(result.bob.grants.some((g) => g.source === "transfer")).toBe(true);

    const worm = await listPaymentAuditEntries(20, process.env);
    expect(worm.some((e) => e.action === "CREDIT_TRANSFER_SENT")).toBe(true);
    expect(worm.some((e) => e.action === "CREDIT_TRANSFER_RECEIVED")).toBe(true);
    const sent = worm.find((e) => e.action === "CREDIT_TRANSFER_SENT");
    expect(sent?.payload.counterparty_tenant_id).toBe("bob");
    expect(sent?.accounting?.category).toBe("peer_transfer");
  });

  it("is idempotent on the same key", async () => {
    await seedTopup("a", 1000);

    const run = () =>
      runPaymentsEffect(
        Effect.gen(function* () {
          const credits = yield* CreditsService;
          return yield* credits.transfer({
            fromTenantId: "a",
            toTenantId: "b",
            amountCents: 400,
            idempotencyKey: "same-key",
          });
        })
      );

    const first = await run();
    const second = await run();
    expect(second.alreadyExisted).toBe(true);
    expect(second.transferId).toBe(first.transferId);

    const bal = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return {
          a: yield* credits.getBalance("a"),
          b: yield* credits.getBalance("b"),
        };
      })
    );
    expect(bal.a.balanceCents).toBe(600);
    expect(bal.b.balanceCents).toBe(400);
  });

  it("rejects same-tenant and overdraft", async () => {
    await seedTopup("solo", 100);

    const same = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits
          .transfer({
            fromTenantId: "solo",
            toTenantId: "solo",
            amountCents: 50,
          })
          .pipe(Effect.either);
      })
    );
    expect(same._tag).toBe("Left");
    if (same._tag === "Left") {
      expect(same.left.reason).toMatch(/same tenant/i);
    }

    const over = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits
          .transfer({
            fromTenantId: "solo",
            toTenantId: "other",
            amountCents: 9999,
          })
          .pipe(Effect.either);
      })
    );
    expect(over._tag).toBe("Left");
    if (over._tag === "Left") {
      expect(over.left.reason).toMatch(/Insufficient credits/i);
    }
  });

  it("stages then confirms (2PC) without moving funds on stage", async () => {
    delete process.env.CLAWQL_CREDITS_TRANSFER_DIRECT;
    resetPaymentsEffectRuntimeForTests();
    await seedTopup("alice", 2000);

    const staged = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.stageTransfer({
          fromTenantId: "alice",
          toTenantId: "bob",
          amountCents: 700,
        });
      })
    );
    expect(staged.confirmationCode).toHaveLength(6);

    const mid = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.getBalance("alice");
      })
    );
    expect(mid.balanceCents).toBe(2000);

    const done = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.confirmTransfer({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
      })
    );
    expect(done.amountCents).toBe(700);
    expect(done.toTenantId).toBe("bob");
  });

  it("requires TOTP on confirm when gate is enabled", async () => {
    delete process.env.CLAWQL_CREDITS_TRANSFER_DIRECT;
    process.env.CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP = "1";
    resetPaymentsEffectRuntimeForTests();

    const enrolled = await runPaymentsEffect(
      Effect.gen(function* () {
        const stepUp = yield* CreditsStepUpService;
        return yield* stepUp.enroll({ tenantId: "alice" });
      })
    );

    await seedTopup("alice", 1000);

    const staged = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.stageTransfer({
          fromTenantId: "alice",
          toTenantId: "bob",
          amountCents: 100,
        });
      })
    );
    expect(staged.totpRequired).toBe(true);

    const denied = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits
          .confirmTransfer({
            actionId: staged.actionId,
            code: staged.confirmationCode,
          })
          .pipe(Effect.either);
      })
    );
    expect(denied._tag).toBe("Left");

    const totp = Effect.runSync(generateTotp(enrolled.enrollment.secretBase32));
    const ok = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.confirmTransfer({
          actionId: staged.actionId,
          code: staged.confirmationCode,
          totp,
        });
      })
    );
    expect(ok.amountCents).toBe(100);
  });
});

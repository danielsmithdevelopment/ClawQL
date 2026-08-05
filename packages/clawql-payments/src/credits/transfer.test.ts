import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLive } from "clawql-core";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
import { lokiPushLiveLayer } from "../audit/loki.js";
import { listPaymentAuditEntries, resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";
import { CreditsService, creditsLiveLayer } from "./credits-service.js";
import {
  appendCreditEntry,
  creditsLedgerLiveLayer,
  resetCreditsLedgerForTests,
} from "./ledger.js";
import { creditsStepUpLiveLayer } from "./step-up.js";
import { pendingActionsLiveLayer } from "../compensation/pending-actions.js";

describe("credits P2P transfer", () => {
  let home: string;

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
    await resetCreditsLedgerForTests(process.env);
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

  const layer = () => {
    const audit = paymentAuditLiveLayer(process.env).pipe(Layer.provide(Layer.mergeAll(AuditLive, lokiPushLiveLayer(process.env))));
    const ledger = creditsLedgerLiveLayer(process.env);
    const stepUp = creditsStepUpLiveLayer(process.env);
    const pending = pendingActionsLiveLayer(process.env);
    return creditsLiveLayer(process.env).pipe(
      Layer.provide(Layer.mergeAll(audit, ledger, stepUp, pending))
    );
  };

  it("moves balance from sender to recipient and writes WORM legs", async () => {
    await appendCreditEntry(
      {
        tenantId: "alice",
        kind: "topup_settled",
        deltaCents: 5000,
        grantSource: "topup",
        note: "seed",
      },
      process.env
    );

    const result = await Effect.runPromise(
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
      }).pipe(Effect.provide(layer()))
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
    await appendCreditEntry(
      { tenantId: "a", kind: "topup_settled", deltaCents: 1000, grantSource: "topup" },
      process.env
    );

    const run = () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const credits = yield* CreditsService;
          return yield* credits.transfer({
            fromTenantId: "a",
            toTenantId: "b",
            amountCents: 400,
            idempotencyKey: "same-key",
          });
        }).pipe(Effect.provide(layer()))
      );

    const first = await run();
    const second = await run();
    expect(second.alreadyExisted).toBe(true);
    expect(second.transferId).toBe(first.transferId);

    const bal = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return {
          a: yield* credits.getBalance("a"),
          b: yield* credits.getBalance("b"),
        };
      }).pipe(Effect.provide(layer()))
    );
    expect(bal.a.balanceCents).toBe(600);
    expect(bal.b.balanceCents).toBe(400);
  });

  it("rejects same-tenant and overdraft", async () => {
    await appendCreditEntry(
      { tenantId: "solo", kind: "topup_settled", deltaCents: 100, grantSource: "topup" },
      process.env
    );

    const same = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits
          .transfer({
            fromTenantId: "solo",
            toTenantId: "solo",
            amountCents: 50,
          })
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer()))
    );
    expect(same._tag).toBe("Left");
    if (same._tag === "Left") {
      expect(same.left.reason).toMatch(/same tenant/i);
    }

    const over = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits
          .transfer({
            fromTenantId: "solo",
            toTenantId: "other",
            amountCents: 9999,
          })
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer()))
    );
    expect(over._tag).toBe("Left");
    if (over._tag === "Left") {
      expect(over.left.reason).toMatch(/Insufficient credits/i);
    }
  });

  it("stages then confirms (2PC) without moving funds on stage", async () => {
    delete process.env.CLAWQL_CREDITS_TRANSFER_DIRECT;
    await appendCreditEntry(
      { tenantId: "alice", kind: "topup_settled", deltaCents: 2000, grantSource: "topup" },
      process.env
    );

    const staged = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.stageTransfer({
          fromTenantId: "alice",
          toTenantId: "bob",
          amountCents: 700,
        });
      }).pipe(Effect.provide(layer()))
    );
    expect(staged.confirmationCode).toHaveLength(6);

    const mid = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.getBalance("alice");
      }).pipe(Effect.provide(layer()))
    );
    expect(mid.balanceCents).toBe(2000);

    const done = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.confirmTransfer({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
      }).pipe(Effect.provide(layer()))
    );
    expect(done.amountCents).toBe(700);
    expect(done.toTenantId).toBe("bob");
  });

  it("requires TOTP on confirm when gate is enabled", async () => {
    delete process.env.CLAWQL_CREDITS_TRANSFER_DIRECT;
    process.env.CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP = "1";
    const { enrollStepUpTotp } = await import("./step-up.js");
    const { generateTotp } = await import("./totp.js");
    const enrolled = await enrollStepUpTotp({ tenantId: "alice" }, process.env);

    await appendCreditEntry(
      { tenantId: "alice", kind: "topup_settled", deltaCents: 1000, grantSource: "topup" },
      process.env
    );

    const staged = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.stageTransfer({
          fromTenantId: "alice",
          toTenantId: "bob",
          amountCents: 100,
        });
      }).pipe(Effect.provide(layer()))
    );
    expect(staged.totpRequired).toBe(true);

    const denied = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits
          .confirmTransfer({
            actionId: staged.actionId,
            code: staged.confirmationCode,
          })
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer()))
    );
    expect(denied._tag).toBe("Left");

    const totp = generateTotp(enrolled.enrollment.secretBase32);
    const ok = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.confirmTransfer({
          actionId: staged.actionId,
          code: staged.confirmationCode,
          totp,
        });
      }).pipe(Effect.provide(layer()))
    );
    expect(ok.amountCents).toBe(100);
  });
});

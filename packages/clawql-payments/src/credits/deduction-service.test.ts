import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetPaymentAuditStoreForTests } from "../audit/index.js";
import { resolveDeductionOutboxPath } from "../config/paths.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { AchTopupService } from "./ach-topup-service.js";
import { CreditsService } from "./credits-service.js";
import { DeductionService } from "./deduction-service.js";
import { CreditsLedgerService } from "./ledger.js";

describe("DeductionService (sync hold → capture/release → outbox)", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-deduction-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_ACH_TOPUP_ENABLED = "1";
    process.env.CLAWQL_ACH_TOPUP_DRY_RUN = "1";
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.CLAWQL_NATS_URL;
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

  const fund = (tenantId: string, amountUsd: number) =>
    runPaymentsEffect(
      Effect.gen(function* () {
        const ach = yield* AchTopupService;
        yield* ach.createTopup({
          customerId: "cus_test",
          amountUsd,
          tenantId,
        });
      })
    );

  const accountBalance = (tenantId: string) =>
    runPaymentsEffect(
      Effect.gen(function* () {
        const ledger = yield* CreditsLedgerService;
        return yield* ledger.getAccount(tenantId);
      })
    );

  it("holds synchronously then captures; outbox records post-deduction events", async () => {
    await fund("t1", 10);
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const d = yield* DeductionService;
        const held = yield* d.hold({
          tenantId: "t1",
          amountCents: 500,
          idempotencyKey: "agent-a",
          resource: "inference_calls",
        });
        const balAfterHold = yield* d.getSpendableBalance("t1");
        const captured = yield* d.capture({
          tenantId: "t1",
          idempotencyKey: "agent-a",
          actualAmountCents: 400,
        });
        const bal = yield* d.getSpendableBalance("t1");
        return { held, balAfterHold, captured, bal };
      })
    );

    expect(result.held.alreadyExisted).toBe(false);
    expect(result.balAfterHold.balanceCents).toBe(500);
    expect(result.captured.refundedCents).toBe(100);
    expect(result.bal.balanceCents).toBe(600);

    const outbox = await readFile(resolveDeductionOutboxPath(process.env), "utf8");
    expect(outbox).toContain("credits.held");
    expect(outbox).toContain("credits.captured");
    expect(outbox).toContain("agent-a");
  });

  it("prevents concurrent overspend via sync holds (5 agents)", async () => {
    await fund("t1", 6); // 600¢
    const keys = ["a", "b", "c", "d", "e"];
    const outcomes = await Promise.all(
      keys.map((k) =>
        runPaymentsEffect(
          Effect.gen(function* () {
            const d = yield* DeductionService;
            return yield* d
              .hold({
                tenantId: "t1",
                amountCents: 500,
                idempotencyKey: `swarm-${k}`,
              })
              .pipe(Effect.either);
          })
        )
      )
    );

    const allowed = outcomes.filter((o) => o._tag === "Right");
    const denied = outcomes.filter((o) => o._tag === "Left");
    expect(allowed).toHaveLength(1);
    expect(denied).toHaveLength(4);

    const account = await accountBalance("t1");
    expect(account.balanceCents).toBe(100);
  });

  it("releases hold on failure path and restores balance", async () => {
    await fund("t1", 5);
    await runPaymentsEffect(
      Effect.gen(function* () {
        const d = yield* DeductionService;
        yield* d.hold({
          tenantId: "t1",
          amountCents: 200,
          idempotencyKey: "fail-path",
        });
        yield* d.release({ tenantId: "t1", idempotencyKey: "fail-path" });
      })
    );
    const account = await accountBalance("t1");
    expect(account.balanceCents).toBe(500);
  });

  it("debit is idempotent for the same key", async () => {
    await fund("t1", 5);
    await runPaymentsEffect(
      Effect.gen(function* () {
        const d = yield* DeductionService;
        yield* d.debit({
          tenantId: "t1",
          amountCents: 100,
          idempotencyKey: "once",
          resource: "inference",
        });
        yield* d.debit({
          tenantId: "t1",
          amountCents: 100,
          idempotencyKey: "once",
          resource: "inference",
        });
        const credits = yield* CreditsService;
        return yield* credits.getBalance("t1");
      })
    );
    const account = await accountBalance("t1");
    expect(account.balanceCents).toBe(400);
  });
});

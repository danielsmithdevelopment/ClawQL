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
import { AgentCompensationService } from "./agent-compensation-service.js";

describe("AgentCompensationService", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-comp-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_COMPENSATION_ENABLED = "1";
    process.env.CLAWQL_PAYOUTS_ENABLED = "1";
    process.env.CLAWQL_PAYOUTS_DRY_RUN = "1";
    delete process.env.CLAWQL_COMPENSATION_DIRECT;
    resetPaymentsEffectRuntimeForTests();
    await resetPaymentAuditStoreForTests();
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_COMPENSATION_ENABLED;
    delete process.env.CLAWQL_PAYOUTS_ENABLED;
    delete process.env.CLAWQL_PAYOUTS_DRY_RUN;
    await rm(home, { recursive: true, force: true });
  });

  it("stages SGDOP recruit deposit, approve view is inert, confirm credits ledger", async () => {
    const staged = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.stageDeposit({
          agentId: "agent-diversity-1",
          amountUsd: 50,
          asset: "credits",
          reason: "sgdop_recruit",
          recruitmentId: "blindspot-azimuth-9",
        });
      })
    );
    expect(staged.classification).toBe("financial");
    expect(staged.approvalUrl).toContain("payments_compensation_deposit/approve");
    expect(staged.confirmationCode).toHaveLength(6);

    const view = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.approve({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
      })
    );
    expect(view.status).toBe("pending");
    expect(view.confirmUrl).toContain("/confirm?");

    const before = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.getAccount("agent-diversity-1");
      })
    );
    expect(before.creditsUsd).toBe(0);

    const deposited = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.confirm({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
      })
    );
    expect("balance" in deposited && deposited.balance.creditsUsd).toBe(50);

    const entries = await listPaymentAuditEntries(30);
    expect(entries.some((e) => e.action === "COMPENSATION_STAGED")).toBe(true);
    expect(entries.some((e) => e.action === "COMPENSATION_DEPOSITED")).toBe(true);
  });

  it("cash-out stages then pays via PayoutService dry-run", async () => {
    await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        const staged = yield* comp.stageDeposit({
          agentId: "agent-2",
          amountUsd: 30,
          asset: "credits",
        });
        yield* comp.confirm({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
        yield* comp.setPreference({
          agentId: "agent-2",
          cashoutMethod: "bank",
          connectAccountId: "acct_dry_comp",
        });
        return yield* Effect.void;
      })
    );

    const cashout = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        const staged = yield* comp.stageCashout({
          agentId: "agent-2",
          amountUsd: 20,
          source: "credits",
          destination: "bank",
        });
        return yield* comp.confirm({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
      })
    );
    expect("payout" in cashout).toBe(true);
    if ("payout" in cashout) {
      expect(cashout.payout.dryRun).toBe(true);
      expect(cashout.balance.creditsUsd).toBe(10);
    }
    const entries = await listPaymentAuditEntries(40);
    expect(entries.some((e) => e.action === "COMPENSATION_CASHOUT_COMPLETED")).toBe(true);
  });

  it("cancel is GET-safe and blocks later confirm", async () => {
    const staged = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.stageDeposit({
          agentId: "agent-3",
          amountUsd: 10,
          asset: "funds",
        });
      })
    );
    await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.cancel({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
      })
    );
    await expect(
      runPaymentsEffect(
        Effect.gen(function* () {
          const comp = yield* AgentCompensationService;
          return yield* comp.confirm({
            actionId: staged.actionId,
            code: staged.confirmationCode,
          });
        })
      )
    ).rejects.toMatchObject({ reason: expect.stringMatching(/cancelled/i) });
  });
});

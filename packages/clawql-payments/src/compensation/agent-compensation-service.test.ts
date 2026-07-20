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
    expect(staged.approvalUrl).toContain("agent_compensation_deposit_stage/approve");
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
    const stagedEvt = entries.find((e) => e.action === "COMPENSATION_DEPOSIT_STAGED");
    expect(stagedEvt).toBeTruthy();
    expect(stagedEvt?.payload.reason).toBe("sgdop_recruit");
    expect(stagedEvt?.payload.recruitment_id).toBe("blindspot-azimuth-9");
    const confirmed = entries.find((e) => e.action === "COMPENSATION_DEPOSIT_CONFIRMED");
    expect(confirmed).toBeTruthy();
    expect(confirmed?.payload.recruitment_id).toBe("blindspot-azimuth-9");
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
    expect(entries.some((e) => e.action === "COMPENSATION_CASHOUT_STAGED")).toBe(true);
    expect(entries.some((e) => e.action === "COMPENSATION_CASHOUT_COMPLETED")).toBe(true);
  });

  it("is idempotent on recruitmentId+agentId+reason and blocks double-execute bounty", async () => {
    const first = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.stageDeposit({
          agentId: "agent-idem",
          amountUsd: 25,
          asset: "credits",
          reason: "sgdop_recruit",
          recruitmentId: "blindspot-idem-1",
        });
      })
    );
    expect(first.idempotentReplay).toBeUndefined();

    const replay = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.stageDeposit({
          agentId: "agent-idem",
          amountUsd: 25,
          asset: "credits",
          reason: "sgdop_recruit",
          recruitmentId: "blindspot-idem-1",
        });
      })
    );
    expect(replay.actionId).toBe(first.actionId);
    expect(replay.confirmationCode).toBe(first.confirmationCode);
    expect(replay.idempotentReplay).toBe(true);

    await expect(
      runPaymentsEffect(
        Effect.gen(function* () {
          const comp = yield* AgentCompensationService;
          return yield* comp.stageDeposit({
            agentId: "agent-idem",
            amountUsd: 99,
            asset: "credits",
            reason: "sgdop_recruit",
            recruitmentId: "blindspot-idem-1",
          });
        })
      )
    ).rejects.toMatchObject({ reason: expect.stringMatching(/Idempotent conflict/i) });

    await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.confirm({
          actionId: first.actionId,
          code: first.confirmationCode,
        });
      })
    );

    await expect(
      runPaymentsEffect(
        Effect.gen(function* () {
          const comp = yield* AgentCompensationService;
          return yield* comp.stageDeposit({
            agentId: "agent-idem",
            amountUsd: 25,
            asset: "credits",
            reason: "sgdop_recruit",
            recruitmentId: "blindspot-idem-1",
          });
        })
      )
    ).rejects.toMatchObject({ reason: expect.stringMatching(/already executed/i) });

    const entries = await listPaymentAuditEntries(40);
    const stagedCount = entries.filter((e) => e.action === "COMPENSATION_DEPOSIT_STAGED").length;
    expect(stagedCount).toBe(1);
  });

  it("emits COMPENSATION_CASHOUT_FAILED and re-credits when payout fails after debit", async () => {
    await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        const staged = yield* comp.stageDeposit({
          agentId: "agent-fail-payout",
          amountUsd: 40,
          asset: "credits",
        });
        yield* comp.confirm({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
        yield* comp.setPreference({
          agentId: "agent-fail-payout",
          cashoutMethod: "bank",
          connectAccountId: "acct_dry_fail",
        });
        return yield* Effect.void;
      })
    );

    const stagedCashout = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.stageCashout({
          agentId: "agent-fail-payout",
          amountUsd: 25,
          source: "credits",
          destination: "bank",
        });
      })
    );

    process.env.CLAWQL_PAYOUTS_ENABLED = "0";
    resetPaymentsEffectRuntimeForTests();

    await expect(
      runPaymentsEffect(
        Effect.gen(function* () {
          const comp = yield* AgentCompensationService;
          return yield* comp.confirm({
            actionId: stagedCashout.actionId,
            code: stagedCashout.confirmationCode,
          });
        })
      )
    ).rejects.toMatchObject({ reason: expect.stringMatching(/payout|disabled/i) });

    process.env.CLAWQL_PAYOUTS_ENABLED = "1";
    resetPaymentsEffectRuntimeForTests();

    const balance = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.getAccount("agent-fail-payout");
      })
    );
    expect(balance.creditsUsd).toBe(40);

    const entries = await listPaymentAuditEntries(50);
    expect(entries.some((e) => e.action === "COMPENSATION_CASHOUT_FAILED")).toBe(true);
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

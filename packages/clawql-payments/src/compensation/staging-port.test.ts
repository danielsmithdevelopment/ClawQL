import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";
import { makeCompensationStagingPort } from "./staging-port.js";

describe("CompensationStagingPort", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-staging-port-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_COMPENSATION_ENABLED = "1";
    process.env.CLAWQL_PAYOUTS_ENABLED = "1";
    process.env.CLAWQL_PAYOUTS_DRY_RUN = "1";
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

  it("stages recruit deposits and lists them by recruitmentId", async () => {
    const port = makeCompensationStagingPort(process.env);
    const staged = await port.stageRecruitDeposit({
      agentId: "agent-port-1",
      amountUsd: 40,
      reason: "sgdop_recruit",
      recruitmentId: "sgdop:emb-v3:7",
      meta: { nsv: 0.1, sgdop: 3.2, bountyKind: "recruit_bounty" },
    });
    expect(staged.classification).toBe("financial");
    expect(staged.approvalUrl).toContain("approve");
    expect(staged.idempotentReplay).toBeUndefined();

    const listed = await port.listStagedForRecruitment("sgdop:emb-v3:7");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.actionId).toBe(staged.actionId);

    const replay = await port.stageRecruitDeposit({
      agentId: "agent-port-1",
      amountUsd: 40,
      reason: "sgdop_recruit",
      recruitmentId: "sgdop:emb-v3:7",
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.actionId).toBe(staged.actionId);
  });
});

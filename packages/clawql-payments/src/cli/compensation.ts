import { Effect } from "effect";
import { AgentCompensationService } from "../compensation/agent-compensation-service.js";
import type { CompensationReason } from "../compensation/agent-compensation-service.js";
import type { PayoutMethod } from "../payouts/preferences.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";

export type PaymentsCompensationBalanceOptions = {
  agentId?: string;
  json?: boolean;
};

export type PaymentsCompensationDepositOptions = {
  agentId?: string;
  amountUsd?: number;
  asset?: "credits" | "funds";
  reason?: CompensationReason;
  recruitmentId?: string;
  tenantId?: string;
  correlationId?: string;
  /** Confirm immediately after stage (still goes through 2PC locally). */
  confirm?: boolean;
  code?: string;
  actionId?: string;
  json?: boolean;
};

export type PaymentsCompensationCashoutOptions = {
  agentId?: string;
  amountUsd?: number;
  source?: "credits" | "funds";
  destination?: PayoutMethod;
  account?: string;
  wallet?: string;
  tenantId?: string;
  confirm?: boolean;
  code?: string;
  actionId?: string;
  json?: boolean;
};

export type PaymentsCompensationApproveOptions = {
  actionId?: string;
  code?: string;
  json?: boolean;
};

export async function runPaymentsCompensationBalance(
  options: PaymentsCompensationBalanceOptions = {}
): Promise<number> {
  if (!options.agentId?.trim()) {
    console.error("Usage: clawql payments compensation balance --agent AGENT_ID");
    return 1;
  }
  const account = await runPaymentsEffect(
    Effect.gen(function* () {
      const comp = yield* AgentCompensationService;
      return yield* comp.getAccount(options.agentId!);
    })
  );
  if (options.json) {
    console.log(JSON.stringify(account, null, 2));
  } else {
    console.log(`Agent ${account.agentId}`);
    console.log(`  credits: $${account.creditsUsd.toFixed(2)}`);
    console.log(`  funds:   $${account.fundsUsd.toFixed(2)}`);
    if (account.cashoutMethod) console.log(`  cashout: ${account.cashoutMethod}`);
  }
  return 0;
}

export async function runPaymentsCompensationDeposit(
  options: PaymentsCompensationDepositOptions = {}
): Promise<number> {
  if (
    !options.agentId?.trim() ||
    options.amountUsd === undefined ||
    !Number.isFinite(options.amountUsd)
  ) {
    console.error(
      "Usage: clawql payments compensation deposit --agent AGENT --amount 25 [--asset credits|funds] [--reason sgdop_recruit]"
    );
    return 1;
  }
  const staged = await runPaymentsEffect(
    Effect.gen(function* () {
      const comp = yield* AgentCompensationService;
      return yield* comp.stageDeposit({
        agentId: options.agentId!,
        amountUsd: options.amountUsd!,
        asset: options.asset ?? "credits",
        reason: options.reason ?? "manual",
        recruitmentId: options.recruitmentId,
        tenantId: options.tenantId,
        correlationId: options.correlationId,
      });
    })
  );
  if (options.confirm) {
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.confirm({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
      })
    );
    if (options.json) {
      console.log(JSON.stringify({ staged, result }, null, 2));
    } else {
      console.log(
        `Deposited $${staged.amountUsd} ${staged.kind} → ${staged.agentId} (action ${staged.actionId})`
      );
    }
    return 0;
  }
  if (options.json) {
    console.log(JSON.stringify(staged, null, 2));
  } else {
    console.log(`Staged ${staged.kind} $${staged.amountUsd} for ${staged.agentId}`);
    console.log(`  action_id: ${staged.actionId}`);
    console.log(`  code:      ${staged.confirmationCode}`);
    console.log(`  approve:   ${staged.approvalUrl}`);
    console.log(`  cancel:    ${staged.cancelUrl}`);
    console.log(
      `Confirm: clawql payments compensation confirm --action-id ${staged.actionId} --code ${staged.confirmationCode}`
    );
  }
  return 0;
}

export async function runPaymentsCompensationCashout(
  options: PaymentsCompensationCashoutOptions = {}
): Promise<number> {
  if (
    !options.agentId?.trim() ||
    options.amountUsd === undefined ||
    !Number.isFinite(options.amountUsd)
  ) {
    console.error(
      "Usage: clawql payments compensation cashout --agent AGENT --amount 25 [--source credits|funds] [--destination bank|usdc]"
    );
    return 1;
  }
  const staged = await runPaymentsEffect(
    Effect.gen(function* () {
      const comp = yield* AgentCompensationService;
      return yield* comp.stageCashout({
        agentId: options.agentId!,
        amountUsd: options.amountUsd!,
        source: options.source,
        destination: options.destination,
        connectAccountId: options.account,
        usdcWallet: options.wallet,
        tenantId: options.tenantId,
      });
    })
  );
  if (options.confirm) {
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const comp = yield* AgentCompensationService;
        return yield* comp.confirm({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });
      })
    );
    if (options.json) {
      console.log(JSON.stringify({ staged, result }, null, 2));
    } else {
      console.log(`Cash-out confirmed for ${staged.agentId} (action ${staged.actionId})`);
    }
    return 0;
  }
  if (options.json) {
    console.log(JSON.stringify(staged, null, 2));
  } else {
    console.log(`Staged cashout $${staged.amountUsd} for ${staged.agentId}`);
    console.log(`  action_id: ${staged.actionId}`);
    console.log(`  code:      ${staged.confirmationCode}`);
    console.log(`  approve:   ${staged.approvalUrl}`);
  }
  return 0;
}

export async function runPaymentsCompensationApprove(
  options: PaymentsCompensationApproveOptions = {}
): Promise<number> {
  if (!options.actionId?.trim() || !options.code?.trim()) {
    console.error("Usage: clawql payments compensation approve --action-id ID --code CODE");
    return 1;
  }
  const view = await runPaymentsEffect(
    Effect.gen(function* () {
      const comp = yield* AgentCompensationService;
      return yield* comp.approve({
        actionId: options.actionId!,
        code: options.code!,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(view, null, 2));
  } else {
    console.log(`Action ${view.actionId} status=${view.status} kind=${view.kind}`);
    if (view.confirmUrl) console.log(`  confirm: ${view.confirmUrl}`);
    if (view.cancelUrl) console.log(`  cancel:  ${view.cancelUrl}`);
  }
  return 0;
}

export async function runPaymentsCompensationConfirm(
  options: PaymentsCompensationApproveOptions = {}
): Promise<number> {
  if (!options.actionId?.trim() || !options.code?.trim()) {
    console.error("Usage: clawql payments compensation confirm --action-id ID --code CODE");
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const comp = yield* AgentCompensationService;
      return yield* comp.confirm({
        actionId: options.actionId!,
        code: options.code!,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Confirmed action ${options.actionId}`);
    console.log(JSON.stringify(result, null, 2));
  }
  return 0;
}

export async function runPaymentsCompensationCancel(
  options: PaymentsCompensationApproveOptions = {}
): Promise<number> {
  if (!options.actionId?.trim() || !options.code?.trim()) {
    console.error("Usage: clawql payments compensation cancel --action-id ID --code CODE");
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const comp = yield* AgentCompensationService;
      return yield* comp.cancel({
        actionId: options.actionId!,
        code: options.code!,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Cancelled ${result.actionId}`);
  }
  return 0;
}

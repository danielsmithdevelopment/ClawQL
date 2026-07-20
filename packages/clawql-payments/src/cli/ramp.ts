import { Effect } from "effect";
import { RampService } from "../ramp/ramp-service.js";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";

export type PaymentsRampFundCreateOptions = {
  name?: string;
  limitUsd?: number;
  interval?: "DAILY" | "WEEKLY" | "MONTHLY" | "TOTAL" | "ANNUAL";
  tenantId?: string;
  json?: boolean;
};

export type PaymentsRampCardIssueOptions = {
  userId?: string;
  name?: string;
  limitUsd?: number;
  interval?: "DAILY" | "WEEKLY" | "MONTHLY" | "TOTAL" | "ANNUAL";
  tenantId?: string;
  agentId?: string;
  showSecrets?: boolean;
  json?: boolean;
};

export type PaymentsRampAgentCardOptions = {
  userId?: string;
  amountUsd?: number;
  name?: string;
  vendorIds?: string[];
  tenantId?: string;
  agentId?: string;
  showSecrets?: boolean;
  json?: boolean;
};

export async function runPaymentsRampFundCreate(
  options: PaymentsRampFundCreateOptions = {}
): Promise<number> {
  if (options.limitUsd === undefined || !Number.isFinite(options.limitUsd)) {
    console.error('Usage: clawql payments ramp fund create --limit 500 [--name "Agent spend"]');
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const ramp = yield* RampService;
      return yield* ramp.createFund({
        displayName: options.name || "ClawQL agent fund",
        limitUsd: options.limitUsd!,
        interval: options.interval,
        tenantId: options.tenantId,
      });
    })
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Ramp fund ${result.id}: ${result.displayName} limit $${result.limitUsd.toFixed(2)}${result.dryRun ? " [dry-run]" : ""}`
    );
  }
  return 0;
}

export async function runPaymentsRampCardIssue(
  options: PaymentsRampCardIssueOptions = {}
): Promise<number> {
  if (!options.userId?.trim() || options.limitUsd === undefined) {
    console.error(
      "Usage: clawql payments ramp card issue --user-id USER --limit 100 [--show-secrets]"
    );
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const ramp = yield* RampService;
      return yield* ramp.createVirtualCard({
        userId: options.userId!,
        displayName: options.name,
        limitUsd: options.limitUsd!,
        interval: options.interval,
        tenantId: options.tenantId,
        agentId: options.agentId,
      });
    })
  );
  printCard(result, options);
  return 0;
}

export async function runPaymentsRampAgentCardIssue(
  options: PaymentsRampAgentCardOptions = {}
): Promise<number> {
  if (!options.userId?.trim() || options.amountUsd === undefined) {
    console.error(
      "Usage: clawql payments ramp agent-card issue --user-id USER --amount 25 [--agent agent-1] [--show-secrets]"
    );
    return 1;
  }
  const result = await runPaymentsEffect(
    Effect.gen(function* () {
      const ramp = yield* RampService;
      return yield* ramp.issueAgentCard({
        userId: options.userId!,
        amountUsd: options.amountUsd!,
        displayName: options.name,
        allowedVendorIds: options.vendorIds,
        tenantId: options.tenantId,
        agentId: options.agentId,
      });
    })
  );
  printCard(result, options);
  return 0;
}

function printCard(
  result: {
    id: string;
    fundId?: string;
    lastFour?: string;
    pan?: string;
    cvv?: string;
    expiration?: string;
    amountUsd?: number;
    agentScoped: boolean;
    dryRun: boolean;
  },
  options: { showSecrets?: boolean; json?: boolean }
): void {
  if (options.json) {
    const payload = options.showSecrets
      ? result
      : {
          ...result,
          pan: result.pan ? "[redacted]" : undefined,
          cvv: result.cvv ? "[redacted]" : undefined,
        };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const kind = result.agentScoped ? "Agent card" : "Virtual card";
  console.log(
    `${kind} ${result.id}${result.lastFour ? ` ****${result.lastFour}` : ""}${result.dryRun ? " [dry-run]" : ""}`
  );
  if (result.fundId) console.log(`Fund: ${result.fundId}`);
  if (result.amountUsd !== undefined) console.log(`Cap: $${result.amountUsd.toFixed(2)}`);
  if (options.showSecrets && result.pan) {
    console.log(`PAN: ${result.pan}`);
    if (result.cvv) console.log(`CVV: ${result.cvv}`);
    if (result.expiration) console.log(`Exp: ${result.expiration}`);
    console.warn(
      "PCI: treat card details as secrets; they are never written to the WORM audit log."
    );
  } else if (result.pan || result.dryRun) {
    console.log("Pass --show-secrets to print PAN/CVV once (not audited).");
  }
}

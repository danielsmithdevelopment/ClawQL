/**
 * `clawql payments approve <quoteDigest>` — record a one-shot outbound payment
 * operator approval. Refused under regulated, and when running inside a harness
 * agent shell (audit Y4 / R12).
 */

import { userInfo } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
  getOutboundPendingQuoteEffect,
  recordOutboundOperatorApprovalEffect,
} from "./operator-approval.js";

export type PaymentsOutboundApproveOptions = {
  quoteDigest?: string;
  /** Ignored for binding — tenant comes from CLAWQL_TENANT_ID only (audit Y2). */
  tenantId?: string;
  principal?: string;
  home?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

function resolveHome(env: NodeJS.ProcessEnv, home?: string): string {
  return home?.trim() || env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
}

function resolvePrincipal(env: NodeJS.ProcessEnv, explicit?: string): string {
  const fromArg = explicit?.trim();
  if (fromArg) return fromArg;
  const fromEnv = env.CLAWQL_OPERATOR_ID?.trim();
  if (fromEnv) return `operator:${fromEnv}`;
  const username = userInfo().username?.trim();
  if (username) return `operator:${username}`;
  throw new Error("Cannot resolve operator principal — set CLAWQL_OPERATOR_ID");
}

/** True when CLI runs inside a harness/agent shell (audit Y4). */
export function isPaymentsApproveBlockedInHarness(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.CLAWQL_IN_HARNESS?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") return true;
  if (env.CLAWQL_HARNESS_ID?.trim()) return true;
  return false;
}

export async function runPaymentsOutboundApprove(
  options: PaymentsOutboundApproveOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  const digest = options.quoteDigest?.trim();
  if (!digest) {
    console.error("Usage: clawql payments approve <quoteDigest> [--principal operator:name]");
    return 1;
  }

  if (env.CLAWQL_TIER?.trim().toLowerCase() === "regulated") {
    console.error(
      "CLAWQL_TIER=regulated refuses CLI payment approve — use the console with a signed-in human."
    );
    return 1;
  }

  if (isPaymentsApproveBlockedInHarness(env)) {
    console.error(
      "clawql payments approve is refused inside a harness/agent shell (audit Y4). " +
        "Approve from an operator terminal or POST /payments/outbound/approve with CLAWQL_OPERATOR_APPROVE_KEY / OIDC."
    );
    return 1;
  }

  // Y2: never take tenant from CLI args for binding — env only.
  const tenantId = env.CLAWQL_TENANT_ID?.trim() || "default";

  try {
    const home = resolveHome(env, options.home);
    const pending = await Effect.runPromise(
      getOutboundPendingQuoteEffect({
        home,
        quoteDigest: digest,
        tenantId,
      })
    );
    if (!pending) {
      console.error(
        "No parked quote for this digest (or wrong tenant / expired). " +
          "Re-run the payment so HITL parks amount/asset/payee/resource first (audit Y3)."
      );
      return 1;
    }

    if (!options.json) {
      console.log("Pending quote:");
      console.log(`  amount:   ${pending.amount} ${pending.asset}`);
      console.log(`  payee:    ${pending.payee}`);
      console.log(`  resource: ${pending.resourceUrl}`);
      if (pending.network) console.log(`  network:  ${pending.network}`);
      console.log(`  tenant:   ${pending.tenantId}`);
    }

    const principal = resolvePrincipal(env, options.principal);
    const approval = await Effect.runPromise(
      recordOutboundOperatorApprovalEffect({
        home,
        quoteDigest: digest,
        principal,
        tenantId,
        env,
      })
    );
    if (options.json) {
      console.log(JSON.stringify(approval, null, 2));
    } else {
      console.log(`Outbound payment approved: ${approval.id}`);
      console.log(`quoteDigest: ${approval.quoteDigest}`);
      console.log(`principal: ${approval.principal}`);
      console.log(`expiresAt: ${approval.expiresAt}`);
      console.log(`Pass operatorApprovalId=${approval.id} to execute_batch.`);
    }
    return 0;
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

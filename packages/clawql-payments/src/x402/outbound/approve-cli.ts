/**
 * `clawql payments approve <quoteDigest>` — record a one-shot outbound payment
 * operator approval (audit X1). Refused under CLAWQL_TIER=regulated.
 */

import { userInfo } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { recordOutboundOperatorApprovalEffect } from "./operator-approval.js";

export type PaymentsOutboundApproveOptions = {
  quoteDigest?: string;
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

export async function runPaymentsOutboundApprove(
  options: PaymentsOutboundApproveOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  const digest = options.quoteDigest?.trim();
  if (!digest) {
    console.error(
      "Usage: clawql payments approve <quoteDigest> [--tenant ID] [--principal operator:name]"
    );
    return 1;
  }

  if (env.CLAWQL_TIER?.trim().toLowerCase() === "regulated") {
    console.error(
      "CLAWQL_TIER=regulated refuses CLI payment approve — use the console with a signed-in human."
    );
    return 1;
  }

  try {
    const principal = resolvePrincipal(env, options.principal);
    const approval = await Effect.runPromise(
      recordOutboundOperatorApprovalEffect({
        home: resolveHome(env, options.home),
        quoteDigest: digest,
        principal,
        tenantId: options.tenantId?.trim() || env.CLAWQL_TENANT_ID?.trim() || "default",
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

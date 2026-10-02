/**
 * Gate for execute-time mandate/block enforcement.
 * Default on; set `CLAWQL_OPERATION_RISK_ENFORCE=0` to classify risk without refusing
 * (useful for unit tests that stub Slack/Onyx POSTs).
 */

import { Effect } from "effect";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/**
 * Whether execute should refuse `mandate` / `block` policies.
 * Unset → enabled; `0` / `false` / `no` → disabled.
 */
export function operationRiskEnforceEnabledEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const raw = env.CLAWQL_OPERATION_RISK_ENFORCE;
    if (raw === undefined) return true;
    return envTruthy(raw);
  });
}

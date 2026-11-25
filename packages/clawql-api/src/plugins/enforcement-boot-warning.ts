/**
 * Boot-time SECURITY WARNING when no tool-scope enforcement is active.
 *
 * Generic — does not check for Panguard by name. Any ProviderPlugin with a
 * blocking `tool` / `pre-execute` hook counts.
 *
 * @see docs/design/clawql-core-plugin-architecture.md §5.4 / §9
 */

import { Effect } from "effect";
import { isProviderPlugin, type AnyPlugin } from "clawql-core";

export const NO_ENFORCEMENT_SECURITY_WARNING =
  "[clawql-api] SECURITY WARNING: no tool-scope enforcement provider is active — " +
  "tool calls are not gated by ATR/policy hooks. This is an explicit deployment choice in 8.0+ " +
  "(providers and enforcement default off). Install a blocking enforcement provider " +
  "(e.g. CLAWQL_PANGUARD_PROXY_PLUGIN=1 and CLAWQL_PANGUARD_IN_PROCESS=1, or any ProviderPlugin " +
  "that registers blocking tool/pre-execute hooks) before production use. " +
  "Silence only if intentional: CLAWQL_ALLOW_NO_ENFORCEMENT=1.";

/** True when at least one registered plugin declares a blocking pre-execute hook. */
export function hasActiveToolEnforcement(plugins: readonly AnyPlugin[]): boolean {
  return plugins.some((p) => {
    if (!isProviderPlugin(p)) return false;
    return (p.hooks ?? []).some((h) => h.event === "pre-execute" && h.blocking === true);
  });
}

export function allowNoEnforcementExplicitly(): boolean {
  return process.env.CLAWQL_ALLOW_NO_ENFORCEMENT?.trim() === "1";
}

function tierIsRegulated(): boolean {
  return process.env.CLAWQL_TIER?.trim().toLowerCase() === "regulated";
}

/**
 * Emit SECURITY WARNING to stderr when zero enforcement hooks are active.
 * Effect-typed for consistency with boot paths; side effect is intentional.
 * Regulated tier refuses CLAWQL_ALLOW_NO_ENFORCEMENT and fails closed when no
 * enforcement is active (audit 3.05).
 */
export function warnIfNoEnforcementActiveEffect(
  plugins: readonly AnyPlugin[]
): Effect.Effect<boolean, never> {
  return Effect.sync(() => {
    if (hasActiveToolEnforcement(plugins)) return false;
    if (tierIsRegulated()) {
      throw new Error(
        "CLAWQL_TIER=regulated requires an active tool-scope enforcement provider " +
          "(e.g. CLAWQL_PANGUARD_PROXY_PLUGIN=1 + CLAWQL_PANGUARD_IN_PROCESS=1). " +
          "CLAWQL_ALLOW_NO_ENFORCEMENT is refused under the regulated profile."
      );
    }
    if (allowNoEnforcementExplicitly()) return false;
    process.stderr.write(`${NO_ENFORCEMENT_SECURITY_WARNING}\n`);
    return true;
  });
}

/** Sync host façade for createClawQLApi / startup. */
export function warnIfNoEnforcementActive(plugins: readonly AnyPlugin[]): boolean {
  return Effect.runSync(warnIfNoEnforcementActiveEffect(plugins));
}

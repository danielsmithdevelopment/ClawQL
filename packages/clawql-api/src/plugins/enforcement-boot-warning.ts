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

/**
 * Emit SECURITY WARNING to stderr when zero enforcement hooks are active.
 * Effect-typed for consistency with boot paths; side effect is intentional.
 */
export function warnIfNoEnforcementActiveEffect(
  plugins: readonly AnyPlugin[]
): Effect.Effect<boolean, never> {
  return Effect.sync(() => {
    if (allowNoEnforcementExplicitly()) return false;
    if (hasActiveToolEnforcement(plugins)) return false;
    process.stderr.write(`${NO_ENFORCEMENT_SECURITY_WARNING}\n`);
    return true;
  });
}

/** Sync host façade for createClawQLApi / startup. */
export function warnIfNoEnforcementActive(plugins: readonly AnyPlugin[]): boolean {
  return Effect.runSync(warnIfNoEnforcementActiveEffect(plugins));
}

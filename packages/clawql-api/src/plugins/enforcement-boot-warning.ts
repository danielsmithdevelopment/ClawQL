/**
 * Boot-time SECURITY WARNING when no tool-scope enforcement is active.
 *
 * Generic — does not check for Panguard by name. Any mcp-proxy plugin with
 * `beforeCallTool`, or any HookRegistry blocking `pre-execute` hook, counts.
 *
 * @see docs/design/clawql-core-plugin-architecture.md §5.4 / §9
 * @see docs/design/clawql-8.0-plugin-architecture-action-items.md Wave 7b
 */

import { Effect } from "effect";
import type { Plugin } from "clawql-core";

export const NO_ENFORCEMENT_SECURITY_WARNING =
  "[clawql-api] SECURITY WARNING: no tool-scope enforcement provider is active — " +
  "tool calls are not gated by ATR/policy hooks. This is an explicit deployment choice in 8.0+ " +
  "(providers and enforcement default off). Install a blocking enforcement provider " +
  "(e.g. CLAWQL_PANGUARD_PROXY_PLUGIN=1 and CLAWQL_PANGUARD_IN_PROCESS=1, or any ProviderPlugin " +
  "that registers blocking tool/pre-execute hooks) before production use. " +
  "Silence only if intentional: CLAWQL_ALLOW_NO_ENFORCEMENT=1.";

/** True when at least one registered plugin can gate tool calls. */
export function hasActiveToolEnforcement(plugins: readonly Plugin[]): boolean {
  return plugins.some((p) => p.kind === "mcp-proxy" && typeof p.beforeCallTool === "function");
}

export function allowNoEnforcementExplicitly(): boolean {
  return process.env.CLAWQL_ALLOW_NO_ENFORCEMENT?.trim() === "1";
}

/**
 * Emit SECURITY WARNING to stderr when zero enforcement hooks are active.
 * Effect-typed for consistency with boot paths; side effect is intentional.
 */
export function warnIfNoEnforcementActiveEffect(
  plugins: readonly Plugin[]
): Effect.Effect<boolean, never> {
  return Effect.sync(() => {
    if (allowNoEnforcementExplicitly()) return false;
    if (hasActiveToolEnforcement(plugins)) return false;
    process.stderr.write(`${NO_ENFORCEMENT_SECURITY_WARNING}\n`);
    return true;
  });
}

/** Sync host façade for createClawQLApi / startup. */
export function warnIfNoEnforcementActive(plugins: readonly Plugin[]): boolean {
  return Effect.runSync(warnIfNoEnforcementActiveEffect(plugins));
}

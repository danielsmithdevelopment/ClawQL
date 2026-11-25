import { Effect } from "effect";

/**
 * Default on for non-regulated tiers.
 * Audit 5.04: when CLAWQL_TIER=regulated and CLAWQL_ENABLE_MCP_EVENTS is unset,
 * Events stay off until an operator explicitly enables them.
 */
export function isMcpEventsEnabled(env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const v = env.CLAWQL_ENABLE_MCP_EVENTS;
    if (v === undefined) {
      const tier = env.CLAWQL_TIER?.trim().toLowerCase();
      if (tier === "regulated") return false;
      return true;
    }
    const t = v.trim().toLowerCase();
    return !(t === "0" || t === "false" || t === "no");
  });
}

export function isMcpEventsEnabledSync(env: NodeJS.ProcessEnv = process.env): boolean {
  return Effect.runSync(isMcpEventsEnabled(env));
}

import { Effect } from "effect";

/** Default on — set CLAWQL_ENABLE_MCP_EVENTS=0 to disable. */
export function isMcpEventsEnabled(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const v = env.CLAWQL_ENABLE_MCP_EVENTS;
    if (v === undefined) return true;
    const t = v.trim().toLowerCase();
    return !(t === "0" || t === "false" || t === "no");
  });
}

export function isMcpEventsEnabledSync(env: NodeJS.ProcessEnv = process.env): boolean {
  return Effect.runSync(isMcpEventsEnabled(env));
}

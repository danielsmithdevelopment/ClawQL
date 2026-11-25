/**
 * Audit 5.04: default MCP Events access check is fail-closed.
 * Open access requires CLAWQL_MCP_EVENTS_OPEN_ACCESS=1 (local demos only).
 */

import { Effect } from "effect";
import type { AccessCheck } from "./types.js";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "on";
}

export function mcpEventsOpenAccessEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return envTruthy(env.CLAWQL_MCP_EVENTS_OPEN_ACCESS);
}

/** Deny-by-default access check (audit 5.04). */
export const defaultMcpEventsAccessCheck: AccessCheck = () => mcpEventsOpenAccessEnabled();

export function defaultMcpEventsAccessCheckEffect(): Effect.Effect<AccessCheck> {
  return Effect.succeed(defaultMcpEventsAccessCheck);
}

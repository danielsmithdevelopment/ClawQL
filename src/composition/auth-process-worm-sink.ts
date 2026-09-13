/**
 * Host wiring: auth SQLite WORM + optional clawql-audit process trail dual-write.
 */

import { createAuthEventWormSink } from "clawql-audit";
import {
  authEventSinkFromPromise,
  composeAuthEventSinks,
  createAuthEventSinkFromEnv,
  type AuthEventSink,
} from "clawql-auth";

/** Auth audit sink for MCP OAuth / ID-JAG — composes process WORM when enabled. */
export function resolveHostAuthEventSink(env: NodeJS.ProcessEnv = process.env): AuthEventSink {
  const primary = createAuthEventSinkFromEnv(env);
  if (env.CLAWQL_WORM_ENABLED?.trim() !== "1") return primary;
  return composeAuthEventSinks(primary, authEventSinkFromPromise(createAuthEventWormSink()));
}

/**
 * Host wiring: auth SQLite WORM + optional clawql-audit process trail dual-write.
 *
 * `clawql-audit` is dynamic-imported only when `CLAWQL_WORM_ENABLED=1`.
 */

import {
  authEventSinkFromPromise,
  composeAuthEventSinks,
  createAuthEventSinkFromEnv,
  type AuthEvent,
  type AuthEventSink,
} from "clawql-auth/gateway";

/** Auth audit sink for MCP OAuth / ID-JAG — composes process WORM when enabled. */
export function resolveHostAuthEventSink(env: NodeJS.ProcessEnv = process.env): AuthEventSink {
  const primary = createAuthEventSinkFromEnv(env);
  if (env.CLAWQL_WORM_ENABLED?.trim() !== "1") return primary;
  let sinkPromise: Promise<(event: AuthEvent) => Promise<void>> | undefined;
  return composeAuthEventSinks(
    primary,
    authEventSinkFromPromise(async (event) => {
      sinkPromise ??= import("clawql-audit").then((m) => m.createAuthEventWormSink());
      const sink = await sinkPromise;
      await sink(event);
    })
  );
}

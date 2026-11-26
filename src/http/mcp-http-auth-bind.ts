/**
 * MCP Streamable HTTP bind + auth-mode gate (audit 2.08 / regulated profile).
 * Used at listen time and by the regulated-refusals dynamic pass.
 */

import { Effect } from "effect";
import type { AuthMode } from "clawql-auth";

function envFlagOn(env: NodeJS.ProcessEnv, name: string): boolean {
  const raw = env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isLoopbackBindHostEffect(host: string): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const h = host.trim().toLowerCase();
    return h === "127.0.0.1" || h === "localhost" || h === "::1";
  });
}

/**
 * Refuse `noAuth` under regulated (any bind) and on non-loopback without
 * `CLAWQL_ALLOW_UNAUTHENTICATED=1` (standard tier only).
 */
export function assertMcpHttpAuthBindPolicyEffect(args: {
  readonly listenHost: string;
  readonly authMode: AuthMode | string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    if (args.authMode !== "noAuth") return;
    const env = args.env ?? process.env;
    const tier = env.CLAWQL_TIER?.trim().toLowerCase() || "standard";
    if (tier === "regulated") {
      return yield* Effect.fail(
        new Error("CLAWQL_TIER=regulated refuses CLAWQL_AUTH_MODE=noAuth — set apiKey or oidc")
      );
    }
    const loopback = yield* isLoopbackBindHostEffect(args.listenHost);
    if (!loopback && !envFlagOn(env, "CLAWQL_ALLOW_UNAUTHENTICATED")) {
      return yield* Effect.fail(
        new Error(
          `CLAWQL_AUTH_MODE=noAuth refused on non-loopback bind ${args.listenHost}; ` +
            "set MCP_HOST=127.0.0.1, enable apiKey/oidc, or set CLAWQL_ALLOW_UNAUTHENTICATED=1"
        )
      );
    }
  });
}

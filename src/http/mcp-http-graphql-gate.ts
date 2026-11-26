/**
 * In-process `/graphql` opt-in gate (audit 2.02). Regulated refuses the surface.
 */

import { Effect } from "effect";

function envFlagOn(env: NodeJS.ProcessEnv, name: string): boolean {
  const raw = env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Succeeds when GraphQL may be mounted; fails when regulated + `CLAWQL_HTTP_GRAPHQL=1`.
 * No-ops when GraphQL is not requested.
 */
export function assertHttpGraphqlAllowedEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const enable =
      envFlagOn(env, "CLAWQL_HTTP_GRAPHQL") && !envFlagOn(env, "CLAWQL_HTTP_SKIP_GRAPHQL");
    if (!enable) return;
    if (env.CLAWQL_TIER?.trim().toLowerCase() === "regulated") {
      return yield* Effect.fail(
        new Error(
          "CLAWQL_HTTP_GRAPHQL is refused in the regulated tier — GraphQL bypasses execute-core governance"
        )
      );
    }
  });
}

/** True when GraphQL attach should run (after {@link assertHttpGraphqlAllowedEffect}). */
export function httpGraphqlEnabledEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(
    () => envFlagOn(env, "CLAWQL_HTTP_GRAPHQL") && !envFlagOn(env, "CLAWQL_HTTP_SKIP_GRAPHQL")
  );
}

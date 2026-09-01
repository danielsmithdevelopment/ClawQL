import { Effect } from "effect";

import type { ObservabilitySessionContext } from "../scopes.js";

const parseScopeList = (raw: string | undefined): readonly string[] | undefined => {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.split(/[,\s]+/).filter(Boolean);
};

/**
 * Resolve observability session context for MCP/HTTP host calls.
 *
 * Precedence:
 * 1. `CLAWQL_OBSERVABILITY_ATR_SCOPE` (+ optional `_SUB`)
 * 2. Permissive local default (`scope: ["*"]`) for noAuth-style demos
 */
export const resolveObservabilitySessionForRuntimeEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ObservabilitySessionContext> =>
  Effect.sync(() => {
    const scope = parseScopeList(env.CLAWQL_OBSERVABILITY_ATR_SCOPE);
    if (scope && scope.length > 0) {
      return {
        sub: env.CLAWQL_OBSERVABILITY_ATR_SUB?.trim() || "env",
        scope,
      };
    }
    return { sub: "local", scope: ["*"] };
  });

import type { WORMAppendInput, WormChainGapError, WormStorageError } from "clawql-audit";
import { WORMAuditTrail } from "clawql-audit";
import { Data, Effect } from "effect";
import type { ATRScope, AgentName } from "./types.js";

export class PanguardDenyError extends Data.TaggedError("PanguardDenyError")<{
  readonly toolName: string;
  readonly reason: "out_of_scope" | "explicitly_denied";
  readonly sessionId?: string;
}> {}

export type PanguardEnforceError = PanguardDenyError | WormStorageError | WormChainGapError;

/** True when the tool is allowed by ATR (in scope and not explicitly denied). */
export const isToolInScope = (toolName: string, atrScope: ATRScope): boolean => {
  if (atrScope.toolsOutOfScope.includes(toolName)) return false;
  return atrScope.toolsInScope.includes(toolName);
};

export const assertToolInScope = (
  toolName: string,
  atrScope: ATRScope
): Effect.Effect<void, PanguardDenyError> =>
  Effect.gen(function* () {
    if (atrScope.toolsOutOfScope.includes(toolName)) {
      return yield* Effect.fail(new PanguardDenyError({ toolName, reason: "explicitly_denied" }));
    }
    if (!atrScope.toolsInScope.includes(toolName)) {
      return yield* Effect.fail(new PanguardDenyError({ toolName, reason: "out_of_scope" }));
    }
  });

export type EnforceToolCallInput = {
  readonly toolName: string;
  readonly atrScope: ATRScope;
  readonly sessionId: string;
  readonly agentName: AgentName;
  readonly virtualKeyId?: string;
  readonly cellId?: string;
  readonly metadata?: Record<string, unknown>;
};

/**
 * ATR gate + WORM: allow → PANGUARD_ALLOW; deny → PANGUARD_DENY then fail.
 */
export const enforceToolCall = (
  input: EnforceToolCallInput
): Effect.Effect<void, PanguardEnforceError, WORMAuditTrail> =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrail;
    const allowed = isToolInScope(input.toolName, input.atrScope);
    const base: WORMAppendInput = {
      type: allowed ? "PANGUARD_ALLOW" : "PANGUARD_DENY",
      timestamp: new Date().toISOString(),
      sessionId: input.sessionId,
      agentName: input.agentName,
      virtualKeyId: input.virtualKeyId,
      cellId: input.cellId,
      metadata: {
        toolName: input.toolName,
        reason: allowed
          ? "in_scope"
          : input.atrScope.toolsOutOfScope.includes(input.toolName)
            ? "explicitly_denied"
            : "out_of_scope",
        ...input.metadata,
      },
    };
    yield* worm.append(base);
    if (!allowed) {
      return yield* Effect.fail(
        new PanguardDenyError({
          toolName: input.toolName,
          reason: input.atrScope.toolsOutOfScope.includes(input.toolName)
            ? "explicitly_denied"
            : "out_of_scope",
          sessionId: input.sessionId,
        })
      );
    }
  });

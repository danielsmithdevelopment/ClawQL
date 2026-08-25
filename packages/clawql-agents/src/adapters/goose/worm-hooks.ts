import type {
  WORMAppendInput,
  WORMEntryType,
  WormChainGapError,
  WormStorageError,
} from "clawql-audit";
import { WORMAuditTrail } from "clawql-audit";
import { Data, Effect } from "effect";
import type { GooseAtrScope } from "./atr-templates.js";

export class GoosePathDenyError extends Data.TaggedError("GoosePathDenyError")<{
  readonly path: string;
  readonly reason: "path_out_of_scope";
  readonly sessionId?: string;
}> {}

export type GoosePathEnforceError = GoosePathDenyError | WormStorageError | WormChainGapError;

export type GooseHookKind =
  | "file_write_attempt"
  | "file_write_result"
  | "shell_attempt"
  | "shell_result"
  | "session_start"
  | "session_end"
  | "panguard_deny";

export type GooseHookEvent = {
  readonly kind: GooseHookKind;
  readonly sessionId: string;
  readonly timestamp?: string;
  readonly path?: string;
  readonly command?: string;
  readonly inScope?: boolean;
  readonly success?: boolean;
  readonly metadata?: Record<string, unknown>;
};

const TYPE_MAP: Record<GooseHookKind, WORMEntryType> = {
  file_write_attempt: "TOOL_CALL_ATTEMPT",
  file_write_result: "TOOL_CALL_RESULT",
  shell_attempt: "TOOL_CALL_ATTEMPT",
  shell_result: "TOOL_CALL_RESULT",
  session_start: "SESSION_START",
  session_end: "SESSION_END",
  panguard_deny: "PANGUARD_DENY",
};

export const gooseHookToWormAppend = (
  event: GooseHookEvent,
  agentName = "goose"
): WORMAppendInput => ({
  type: TYPE_MAP[event.kind],
  timestamp: event.timestamp ?? new Date().toISOString(),
  sessionId: event.sessionId,
  agentName,
  metadata: {
    path: event.path,
    command: event.command,
    inScope: event.inScope,
    success: event.success,
    ...event.metadata,
  },
});

export const isPathInScope = (path: string, atrScope: GooseAtrScope): boolean =>
  atrScope.allowedPaths.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));

/**
 * Intercept Goose file_write: WORM + path ATR before allowing the write.
 */
export const gateGooseFileWrite = (input: {
  readonly path: string;
  readonly atrScope: GooseAtrScope;
  readonly sessionId: string;
  readonly virtualKeyId?: string;
}): Effect.Effect<void, GoosePathEnforceError, WORMAuditTrail> =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrail;
    const inScope = isPathInScope(input.path, input.atrScope);
    yield* worm.append(
      gooseHookToWormAppend({
        kind: inScope ? "file_write_attempt" : "panguard_deny",
        sessionId: input.sessionId,
        path: input.path,
        inScope,
        metadata: { virtualKeyId: input.virtualKeyId },
      })
    );
    if (!inScope) {
      return yield* Effect.fail(
        new GoosePathDenyError({
          path: input.path,
          reason: "path_out_of_scope",
          sessionId: input.sessionId,
        })
      );
    }
  });

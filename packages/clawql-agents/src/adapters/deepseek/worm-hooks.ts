import type {
  WORMAppendInput,
  WORMEntryType,
  AuditError,
} from "clawql-audit";
import { WORMAuditTrailService } from "clawql-audit";
import { Data, Effect } from "effect";
import type { DeepSeekAtrScope } from "./atr-templates.js";

export class DeepSeekPluginDenyError extends Data.TaggedError("DeepSeekPluginDenyError")<{
  readonly pluginName: string;
  readonly reason: "plugin_not_in_scope";
  readonly sessionId?: string;
}> {}

export type DeepSeekPluginEnforceError =
  DeepSeekPluginDenyError | AuditError;

export type DeepSeekHookKind =
  "plugin_load" | "tool_call" | "tool_result" | "session_start" | "session_end" | "panguard_deny";

export type DeepSeekHookEvent = {
  readonly kind: DeepSeekHookKind;
  readonly sessionId: string;
  readonly timestamp?: string;
  readonly pluginName?: string;
  readonly toolName?: string;
  readonly success?: boolean;
  readonly metadata?: Record<string, unknown>;
};

const TYPE_MAP: Record<DeepSeekHookKind, WORMEntryType> = {
  plugin_load: "AGENT_ACTION",
  tool_call: "TOOL_CALL_ATTEMPT",
  tool_result: "TOOL_CALL_RESULT",
  session_start: "SESSION_START",
  session_end: "SESSION_END",
  panguard_deny: "PANGUARD_DENY",
};

export const deepSeekHookToWormAppend = (
  event: DeepSeekHookEvent,
  agentName = "deepseek"
): WORMAppendInput => ({
  type: TYPE_MAP[event.kind],
  timestamp: event.timestamp ?? new Date().toISOString(),
  sessionId: event.sessionId,
  agentName,
  metadata: {
    pluginName: event.pluginName,
    toolName: event.toolName,
    success: event.success,
    ...event.metadata,
  },
});

/**
 * Cordis `plugin:load` gate — block dynamic loads not declared at session start.
 */
export const gateDeepSeekPluginLoad = (input: {
  readonly pluginName: string;
  readonly atrScope: DeepSeekAtrScope;
  readonly sessionId: string;
}): Effect.Effect<void, DeepSeekPluginEnforceError, WORMAuditTrailService> =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    const allowed = input.atrScope.allowedPlugins.includes(input.pluginName);
    yield* worm.append(
      deepSeekHookToWormAppend({
        kind: allowed ? "plugin_load" : "panguard_deny",
        sessionId: input.sessionId,
        pluginName: input.pluginName,
        metadata: { action: "plugin_load_dynamic", allowed },
      })
    );
    if (!allowed) {
      return yield* Effect.fail(
        new DeepSeekPluginDenyError({
          pluginName: input.pluginName,
          reason: "plugin_not_in_scope",
          sessionId: input.sessionId,
        })
      );
    }
  });

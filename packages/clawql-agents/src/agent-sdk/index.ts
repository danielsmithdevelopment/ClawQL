import { WORMAuditTrailService } from "clawql-audit";
import { Effect } from "effect";
import type { AgentSdkHookEvent } from "./worm-hooks.js";
import { agentSdkEventToWormAppendsEffect } from "./worm-hooks.js";

export {
  agentSdkEventToWormAppend,
  agentSdkEventToWormAppendEffect,
  agentSdkEventToWormAppendsEffect,
  appendAgentSdkHookHttpEffect,
  postWormAppendHttpEffect,
  AgentSdkAuditHttpError,
} from "./worm-hooks.js";
export type {
  AgentSdkActionCall,
  AgentSdkAuditHttpConfig,
  AgentSdkHookEvent,
  AgentSdkHookKind,
} from "./worm-hooks.js";

/** Append Agent SDK hook event(s) via in-process WORMAuditTrailService. */
export const appendAgentSdkHook = (event: AgentSdkHookEvent, agentName = "agent-sdk") =>
  Effect.gen(function* () {
    const worm = yield* WORMAuditTrailService;
    const rows = yield* agentSdkEventToWormAppendsEffect(event, agentName);
    const written = [];
    for (const row of rows) {
      written.push(yield* worm.append(row));
    }
    return written;
  });

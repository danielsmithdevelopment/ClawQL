import { Effect } from "effect";
import { loadOpenAppaConfigEffect, openAppaWireToolNameEffect, type OpenAppaConfig } from "./config.js";
import {
  OpenAppaProtocolError,
  OpenAppaTransportError,
  postOpenAppaHookEffect,
} from "./client.js";
import type {
  OpenAppaGateVerdict,
  OpenAppaToolOutcome,
  OpenAppaWireDecision,
} from "./types.js";

const startedRoots = new Set<string>();

/** Test helper — clear session_start cache. */
export function resetOpenAppaSessionCacheForTests(): void {
  startedRoots.clear();
}

function feedbackOf(decision: OpenAppaWireDecision): string {
  if (typeof decision.feedback === "string" && decision.feedback.trim()) {
    return decision.feedback.trim();
  }
  if (typeof decision.reason === "string" && decision.reason.trim()) {
    return decision.reason.trim();
  }
  if (typeof decision.detail === "string" && decision.detail.trim()) {
    const klass = decision.class ? ` (${decision.class})` : "";
    return `${decision.detail.trim()}${klass}`;
  }
  return `OpenAPPA decision: ${decision.decision}`;
}

function attentionRequired(decision: OpenAppaWireDecision): boolean {
  const text = feedbackOf(decision).toLowerCase();
  return text.includes("requires attention") || text.includes("human-approval");
}

function verdictFromToolCallDecision(decision: OpenAppaWireDecision): OpenAppaGateVerdict {
  if (decision.decision === "allow_call" || decision.decision === "pass_control") {
    return { allow: true, decision };
  }
  if (decision.decision === "refuse") {
    return {
      allow: false,
      status: "blocked",
      reason: `OpenAPPA policy blocked tool: ${feedbackOf(decision)}`,
      decision,
    };
  }
  if (
    decision.decision === "deny_call" ||
    decision.decision === "block"
  ) {
    const offerIds = (decision.offers ?? [])
      .map((o) => o.offer_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const status = attentionRequired(decision) ? "mandate_required" : "blocked";
    return {
      allow: false,
      status,
      reason: `OpenAPPA policy blocked tool: ${feedbackOf(decision)}`,
      decision,
      ...(offerIds.length ? { offerIds } : {}),
    };
  }
  return {
    allow: false,
    status: "blocked",
    reason: `OpenAPPA unexpected tool_call decision: ${decision.decision}`,
    decision,
  };
}

function ensureSessionStartedEffect(
  config: OpenAppaConfig,
  rootId: string
): Effect.Effect<void, OpenAppaTransportError | OpenAppaProtocolError> {
  return Effect.gen(function* () {
    if (startedRoots.has(rootId)) return;
    const decision = yield* postOpenAppaHookEffect(config, {
      event: "session_start",
      root_id: rootId,
    });
    if (decision.decision !== "ack" && decision.decision !== "context") {
      return yield* Effect.fail(
        new OpenAppaProtocolError(
          `OpenAPPA session_start unexpected decision: ${decision.decision}`
        )
      );
    }
    startedRoots.add(rootId);
  });
}

export type OpenAppaBeforeCallInput = {
  readonly toolName: string;
  readonly args: unknown;
  readonly sessionId?: string;
  readonly callId?: string;
  readonly config?: OpenAppaConfig | null;
};

/**
 * Layer 5 pre-call gate. When OpenAPPA is disabled, always allows.
 * Transport failures honor `failurePolicy` (block | warn).
 */
export function openAppaBeforeToolCallEffect(
  input: OpenAppaBeforeCallInput
): Effect.Effect<OpenAppaGateVerdict, never> {
  return Effect.gen(function* () {
    const config = input.config !== undefined ? input.config : yield* loadOpenAppaConfigEffect();
    if (!config) {
      return {
        allow: true,
        decision: { protocol: 1, decision: "allow_call" },
      } satisfies OpenAppaGateVerdict;
    }

    const rootId = (input.sessionId?.trim() || "clawql-anon").slice(0, 200);
    const wireTool = yield* openAppaWireToolNameEffect(input.toolName, config.mcpServer);
    const callId =
      input.callId?.trim() ||
      `clawql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const program = Effect.gen(function* () {
      yield* ensureSessionStartedEffect(config, rootId);
      const decision = yield* postOpenAppaHookEffect(config, {
        event: "tool_call",
        root_id: rootId,
        tool: wireTool,
        arguments: input.args ?? {},
        call_id: callId,
      });
      return verdictFromToolCallDecision(decision);
    });

    return yield* program.pipe(
      Effect.catch((err): Effect.Effect<OpenAppaGateVerdict> => {
        const msg = err instanceof Error ? err.message : String(err);
        if (config.failurePolicy === "warn") {
          process.stderr.write(`[clawql-openappa] warning: ${msg}\n`);
          return Effect.succeed({
            allow: true,
            decision: { protocol: 1, decision: "allow_call" },
          });
        }
        return Effect.succeed({
          allow: false,
          status: "blocked",
          reason: `OpenAPPA policy blocked tool: ${msg}`,
          decision: {
            protocol: 1,
            decision: "refuse",
            detail: msg,
            class: "transport",
          },
        });
      })
    );
  });
}

export type OpenAppaAfterResultInput = {
  readonly toolName: string;
  readonly args: unknown;
  readonly sessionId?: string;
  readonly callId?: string;
  readonly outcome: OpenAppaToolOutcome;
  readonly config?: OpenAppaConfig | null;
};

export type OpenAppaAfterResultVerdict =
  | { readonly action: "passthrough"; readonly decision: OpenAppaWireDecision }
  | {
      readonly action: "replace";
      readonly value: string;
      readonly decision: OpenAppaWireDecision;
    }
  | {
      readonly action: "error";
      readonly reason: string;
      readonly decision: OpenAppaWireDecision;
    };

/**
 * Layer 5 post-result hook — surfaces replace_output / deliver_value / refuse.
 * Disabled / warn-on-transport → passthrough.
 */
export function openAppaAfterToolResultEffect(
  input: OpenAppaAfterResultInput
): Effect.Effect<OpenAppaAfterResultVerdict, never> {
  return Effect.gen(function* () {
    const config = input.config !== undefined ? input.config : yield* loadOpenAppaConfigEffect();
    if (!config) {
      return {
        action: "passthrough",
        decision: { protocol: 1, decision: "ack" },
      } satisfies OpenAppaAfterResultVerdict;
    }

    const rootId = (input.sessionId?.trim() || "clawql-anon").slice(0, 200);
    const wireTool = yield* openAppaWireToolNameEffect(input.toolName, config.mcpServer);
    const callId =
      input.callId?.trim() ||
      `clawql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const program = Effect.gen(function* () {
      yield* ensureSessionStartedEffect(config, rootId);
      const decision = yield* postOpenAppaHookEffect(config, {
        event: "tool_result",
        root_id: rootId,
        tool: wireTool,
        arguments: input.args ?? {},
        call_id: callId,
        outcome: input.outcome,
      });
      if (decision.decision === "ack") {
        return { action: "passthrough" as const, decision };
      }
      if (decision.decision === "replace_output" || decision.decision === "deliver_value") {
        const value =
          typeof decision.value === "string"
            ? decision.value
            : typeof decision.output === "string"
              ? decision.output
              : feedbackOf(decision);
        return { action: "replace" as const, value, decision };
      }
      if (decision.decision === "refuse" || decision.decision === "block") {
        return {
          action: "error" as const,
          reason: `OpenAPPA policy blocked tool result: ${feedbackOf(decision)}`,
          decision,
        };
      }
      return { action: "passthrough" as const, decision };
    });

    return yield* program.pipe(
      Effect.catch((err): Effect.Effect<OpenAppaAfterResultVerdict> => {
        const msg = err instanceof Error ? err.message : String(err);
        if (config.failurePolicy === "warn") {
          process.stderr.write(`[clawql-openappa] warning (tool_result): ${msg}\n`);
          return Effect.succeed({
            action: "passthrough",
            decision: { protocol: 1, decision: "ack" },
          });
        }
        return Effect.succeed({
          action: "error",
          reason: `OpenAPPA policy blocked tool result: ${msg}`,
          decision: {
            protocol: 1,
            decision: "refuse",
            detail: msg,
            class: "transport",
          },
        });
      })
    );
  });
}

/** MCP error shape matching native-tool-gate / wrap conventions. */
export function openAppaBlockToMcpResult(verdict: Extract<OpenAppaGateVerdict, { allow: false }>): {
  content: [{ type: "text"; text: string }];
  isError: true;
} {
  const body = {
    ok: false,
    status: verdict.status,
    reason: verdict.reason,
    mechanism: "openappa_layer5",
    ...(verdict.offerIds?.length ? { openappaOfferIds: verdict.offerIds } : {}),
    decision: verdict.decision.decision,
    ...(verdict.decision.class ? { class: verdict.decision.class } : {}),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(body) }],
    isError: true,
  };
}

import { createHash } from "node:crypto";
import { Effect } from "effect";
import { getSessionLabelsSync } from "../ifc/session-label-store.js";
import {
  loadOpenAppaConfigEffect,
  openAppaMayFailOpenEffect,
  openAppaWireToolNameEffect,
  type OpenAppaConfig,
} from "./config.js";
import { OpenAppaProtocolError, OpenAppaTransportError, postOpenAppaHookEffect } from "./client.js";
import {
  openAppaCircuitBeforeCallEffect,
  openAppaCircuitKey,
  openAppaCircuitRecordFailureEffect,
  openAppaCircuitRecordSuccessEffect,
  resetOpenAppaCircuitBreakersForTests,
} from "./circuit-breaker.js";
import { resetOpenAppaHttpAgentsForTests } from "./http-agent.js";
import {
  openAppaAlertLatencyBudgetExceededEffect,
  openAppaIsTimeoutErrorEffect,
  openAppaMaybeWarnSupportedLimitEffect,
  openAppaMaybeWarnTrajectoryGrowthEffect,
  openAppaRecordSessionCallEffect,
  openAppaSessionDepthEffect,
  resetOpenAppaSessionDepthForTests,
} from "./session-depth.js";
import type { OpenAppaGateVerdict, OpenAppaToolOutcome, OpenAppaWireDecision } from "./types.js";

const startedRoots = new Set<string>();

type AllowCacheEntry = { readonly expiresAt: number; readonly decision: OpenAppaWireDecision };
const allowCache = new Map<string, AllowCacheEntry>();
let allowCacheEpoch = "";

function syncAllowCacheEpoch(epoch: string): void {
  if (allowCacheEpoch !== epoch) {
    allowCache.clear();
    allowCacheEpoch = epoch;
  }
}

/** Invalidate brief allow-cache (policy reload / epoch bump / circuit open). */
export function invalidateOpenAppaAllowCacheEffect(): Effect.Effect<void> {
  return Effect.sync(() => {
    allowCache.clear();
  });
}

/** Test helper — clear session_start + allow caches + circuit + agents. */
export function resetOpenAppaSessionCacheForTests(): void {
  startedRoots.clear();
  allowCache.clear();
  allowCacheEpoch = "";
  resetOpenAppaCircuitBreakersForTests();
  resetOpenAppaHttpAgentsForTests();
  resetOpenAppaSessionDepthForTests();
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
  if (decision.decision === "deny_call" || decision.decision === "block") {
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

function sidecarUnavailableVerdict(
  msg: string,
  klass: string = "sidecar_unavailable"
): OpenAppaGateVerdict {
  return {
    allow: false,
    status: "blocked",
    reason: `OpenAPPA policy blocked tool: ${msg}`,
    decision: {
      protocol: 1,
      decision: "refuse",
      detail: msg,
      class: klass,
    },
  };
}

function argsDigest(args: unknown): string {
  try {
    return createHash("sha256")
      .update(JSON.stringify(args ?? {}))
      .digest("hex")
      .slice(0, 24);
  } catch {
    return "unhashable";
  }
}

function digestParts(parts: readonly string[]): string {
  if (!parts.length) return "empty";
  return createHash("sha256")
    .update([...parts].sort().join("\0"))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Allow-cache key must include everything the decision depended on:
 * policy epoch, session (root), caller, session data-flow labels, tool, args.
 * Omitting caller/session/labels would let an allow leak across contexts.
 */
export function buildOpenAppaAllowCacheKeyEffect(input: {
  readonly policyEpoch: string;
  readonly sessionId: string;
  readonly callerId?: string;
  readonly atrScopeTokens?: readonly string[];
  readonly sessionLabels?: readonly string[];
  readonly wireTool: string;
  readonly args: unknown;
}): Effect.Effect<string> {
  return Effect.sync(() => {
    const callerParts = [
      ...(input.callerId?.trim() ? [input.callerId.trim()] : []),
      ...(input.atrScopeTokens ?? []).map((t) => t.trim()).filter(Boolean),
    ];
    const caller = digestParts(callerParts.length ? callerParts : ["anon"]);
    const labels = digestParts(
      (input.sessionLabels ?? []).map((l) => String(l).trim()).filter(Boolean)
    );
    return [
      input.policyEpoch,
      input.sessionId,
      `c:${caller}`,
      `l:${labels}`,
      input.wireTool,
      argsDigest(input.args),
    ].join("|");
  });
}

function resolveSessionLabelsForCache(
  sessionId: string,
  explicit?: readonly string[]
): readonly string[] {
  if (explicit !== undefined) return [...explicit].map(String);
  try {
    return [...getSessionLabelsSync(sessionId)].map(String);
  } catch {
    return [];
  }
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
  /** Authenticated caller / principal id when the host has one. */
  readonly callerId?: string;
  /** ATR / scope tokens that identify the caller identity surface. */
  readonly atrScopeTokens?: readonly string[];
  /**
   * Session data-flow (IFC) labels at decision time. When omitted, loaded from
   * the session label store so cache keys track taint that changed mid-session.
   */
  readonly sessionLabels?: readonly string[];
  readonly callId?: string;
  readonly config?: OpenAppaConfig | null;
};

/**
 * Layer 5 pre-call gate. When OpenAPPA is disabled, always allows.
 *
 * Sidecar down / timeout:
 * - **Writes** (and execute-path): always fail closed (`sidecar_unavailable`).
 * - **Reads**: fail closed by default; `CLAWQL_OPENAPPA_READ_FAILURE_POLICY=warn` may fail open.
 */
export function openAppaBeforeToolCallEffect(
  input: OpenAppaBeforeCallInput
): Effect.Effect<OpenAppaGateVerdict, never> {
  return Effect.gen(function* () {
    let config: OpenAppaConfig | null;
    if (input.config !== undefined) {
      config = input.config;
    } else {
      const loaded = yield* loadOpenAppaConfigEffect().pipe(Effect.result);
      if (loaded._tag === "Failure") {
        const err = loaded.failure;
        return sidecarUnavailableVerdict(err instanceof Error ? err.message : String(err));
      }
      config = loaded.success;
    }

    if (!config) {
      return {
        allow: true,
        decision: { protocol: 1, decision: "allow_call" },
      } satisfies OpenAppaGateVerdict;
    }

    syncAllowCacheEpoch(config.policyEpoch);

    const circuitKey = openAppaCircuitKey(config.baseUrl);
    const circuitCfg = {
      failureThreshold: config.circuitFailureThreshold,
      cooldownMs: config.circuitCooldownMs,
    };
    const circuitBlock = yield* openAppaCircuitBeforeCallEffect(circuitKey, circuitCfg);
    if (circuitBlock) {
      yield* invalidateOpenAppaAllowCacheEffect();
      return sidecarUnavailableVerdict(circuitBlock);
    }

    const rootId = (input.sessionId?.trim() || "clawql-anon").slice(0, 200);
    const wireTool = yield* openAppaWireToolNameEffect(input.toolName, config.mcpServer);
    const callId =
      input.callId?.trim() ||
      `clawql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const sessionLabels = resolveSessionLabelsForCache(rootId, input.sessionLabels);
    const cacheKey = yield* buildOpenAppaAllowCacheKeyEffect({
      policyEpoch: config.policyEpoch,
      sessionId: rootId,
      callerId: input.callerId,
      atrScopeTokens: input.atrScopeTokens,
      sessionLabels,
      wireTool,
      args: input.args,
    });

    if (config.allowCacheMs > 0) {
      const hit = allowCache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return verdictFromToolCallDecision(hit.decision);
      }
    }

    const program = Effect.gen(function* () {
      yield* ensureSessionStartedEffect(config, rootId);
      const t0 = yield* Effect.sync(() => performance.now());
      const decision = yield* postOpenAppaHookEffect(config, {
        event: "tool_call",
        root_id: rootId,
        tool: wireTool,
        arguments: input.args ?? {},
        call_id: callId,
      });
      const elapsedMs = yield* Effect.sync(() => performance.now() - t0);
      const depth = yield* openAppaRecordSessionCallEffect(rootId);
      yield* openAppaMaybeWarnSupportedLimitEffect(rootId, depth);
      yield* openAppaMaybeWarnTrajectoryGrowthEffect(rootId, depth, elapsedMs, config.timeoutMs);
      yield* openAppaCircuitRecordSuccessEffect(circuitKey);
      if (
        config.allowCacheMs > 0 &&
        (decision.decision === "allow_call" || decision.decision === "pass_control")
      ) {
        allowCache.set(cacheKey, {
          expiresAt: Date.now() + config.allowCacheMs,
          decision,
        });
      } else {
        // Non-allow decisions must not linger as stale allows after policy change.
        allowCache.delete(cacheKey);
      }
      return verdictFromToolCallDecision(decision);
    });

    return yield* program.pipe(
      Effect.catch((err): Effect.Effect<OpenAppaGateVerdict> => {
        const msg = err instanceof Error ? err.message : String(err);
        return Effect.gen(function* () {
          const depth = yield* openAppaRecordSessionCallEffect(rootId);
          yield* openAppaMaybeWarnSupportedLimitEffect(rootId, depth);
          const timedOut = yield* openAppaIsTimeoutErrorEffect(err);
          const { opened } = yield* openAppaCircuitRecordFailureEffect(circuitKey, circuitCfg);
          if (opened) yield* invalidateOpenAppaAllowCacheEffect();
          const mayOpen = yield* openAppaMayFailOpenEffect(config, input.toolName);
          if (mayOpen) {
            process.stderr.write(`[clawql-openappa] warning (read fail-open): ${msg}\n`);
            return {
              allow: true,
              decision: { protocol: 1, decision: "allow_call" },
            } satisfies OpenAppaGateVerdict;
          }
          if (timedOut) {
            const alert = yield* openAppaAlertLatencyBudgetExceededEffect(
              rootId,
              depth,
              config.timeoutMs
            );
            return sidecarUnavailableVerdict(alert, "policy_latency_budget");
          }
          return sidecarUnavailableVerdict(`sidecar unavailable — ${msg}`, "sidecar_unavailable");
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
 * Transport failures: writes fail closed; reads honor readFailurePolicy.
 */
export function openAppaAfterToolResultEffect(
  input: OpenAppaAfterResultInput
): Effect.Effect<OpenAppaAfterResultVerdict, never> {
  return Effect.gen(function* () {
    let config: OpenAppaConfig | null;
    if (input.config !== undefined) {
      config = input.config;
    } else {
      const loaded = yield* loadOpenAppaConfigEffect().pipe(Effect.result);
      if (loaded._tag === "Failure") {
        const err = loaded.failure;
        const msg = err instanceof Error ? err.message : String(err);
        return {
          action: "error" as const,
          reason: `OpenAPPA policy blocked tool result: sidecar unavailable — ${msg}`,
          decision: {
            protocol: 1 as const,
            decision: "refuse" as const,
            detail: msg,
            class: "sidecar_unavailable",
          },
        };
      }
      config = loaded.success;
    }

    if (!config) {
      return {
        action: "passthrough",
        decision: { protocol: 1, decision: "ack" },
      } satisfies OpenAppaAfterResultVerdict;
    }

    syncAllowCacheEpoch(config.policyEpoch);
    const circuitKey = openAppaCircuitKey(config.baseUrl);
    const circuitCfg = {
      failureThreshold: config.circuitFailureThreshold,
      cooldownMs: config.circuitCooldownMs,
    };
    const circuitBlock = yield* openAppaCircuitBeforeCallEffect(circuitKey, circuitCfg);
    if (circuitBlock) {
      return {
        action: "error" as const,
        reason: `OpenAPPA policy blocked tool result: sidecar unavailable — ${circuitBlock}`,
        decision: {
          protocol: 1 as const,
          decision: "refuse" as const,
          detail: circuitBlock,
          class: "sidecar_unavailable",
        },
      };
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
      yield* openAppaCircuitRecordSuccessEffect(circuitKey);
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
        return Effect.gen(function* () {
          yield* openAppaCircuitRecordFailureEffect(circuitKey, circuitCfg);
          const mayOpen = yield* openAppaMayFailOpenEffect(config, input.toolName);
          if (mayOpen) {
            process.stderr.write(
              `[clawql-openappa] warning (tool_result read fail-open): ${msg}\n`
            );
            return {
              action: "passthrough" as const,
              decision: { protocol: 1 as const, decision: "ack" as const },
            };
          }
          const timedOut = yield* openAppaIsTimeoutErrorEffect(err);
          const depth = yield* openAppaSessionDepthEffect(rootId);
          if (timedOut) {
            const alert = yield* openAppaAlertLatencyBudgetExceededEffect(
              rootId,
              depth || 1,
              config.timeoutMs
            );
            return {
              action: "error" as const,
              reason: `OpenAPPA policy blocked tool result: ${alert}`,
              decision: {
                protocol: 1 as const,
                decision: "refuse" as const,
                detail: alert,
                class: "policy_latency_budget",
              },
            };
          }
          return {
            action: "error" as const,
            reason: `OpenAPPA policy blocked tool result: sidecar unavailable — ${msg}`,
            decision: {
              protocol: 1 as const,
              decision: "refuse" as const,
              detail: msg,
              class: "sidecar_unavailable",
            },
          };
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
    layers: [
      {
        layer: "openappa_layer5",
        status: verdict.status,
        reason: verdict.reason,
        ...(verdict.decision.class ? { class: verdict.decision.class } : {}),
      },
    ],
    ...(verdict.offerIds?.length ? { openappaOfferIds: verdict.offerIds } : {}),
    decision: verdict.decision.decision,
    ...(verdict.decision.class ? { class: verdict.decision.class } : {}),
  };
  return {
    content: [{ type: "text", text: JSON.stringify(body) }],
    isError: true,
  };
}

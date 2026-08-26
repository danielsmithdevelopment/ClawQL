/**
 * Domain → WORM append mappers + thin host sink façades.
 * clawql-audit does not depend on clawql-auth / clawql-memory; shapes are structural.
 */

import { Effect } from "effect";
import type { WORMAppendInput, WORMEntry, WORMEntryType } from "./entry.js";
import { appendProcessWorm, appendProcessWormEffect } from "./process-worm.js";

export type AuthWormEvent = {
  type: string;
  timestamp: string;
  [key: string]: unknown;
};

export type MemoryWormEventLike = {
  kind: string;
  at: string;
  path?: string;
  correlationId?: string;
  wormRef?: string | null;
  detail?: Record<string, unknown>;
};

export type WebWormEventLike = {
  type: string;
  ts: string;
  provider?: string;
  query?: string;
  url?: string;
  reason?: string;
  fallback?: string;
  correlationId?: string;
  ok?: boolean;
  detail?: string;
};

export type PaymentWormEventLike = {
  ts: string;
  category: string;
  action: string;
  summary: string;
  correlationId?: string;
  payload?: Record<string, unknown>;
};

export type InferenceCallLike = {
  timestamp?: string;
  correlationId?: string;
  modelId: string;
  provider?: string;
  model?: string;
  tier?: string;
  team?: string;
  tenantId?: string;
  virtualKeyId?: string;
  messageCount?: number;
  cacheIntent?: string;
};

export type InferenceResultLike = {
  timestamp?: string;
  correlationId?: string;
  modelId: string;
  provider?: string;
  tier?: string;
  virtualKeyId?: string;
  ok: boolean;
  latencyMs?: number;
  cacheHit?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  detail?: string;
};

/** Routing audit rows from clawql-inference (`model_escalation`, `agent_coordination`). */
export type InferenceAuditEntryLike = {
  ts: string;
  category: string;
  action: string;
  summary: string;
  correlationId?: string;
  payload?: Record<string, unknown>;
};

export const wormInputFromAuthEvent = (
  event: AuthWormEvent
): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => {
    const { type, timestamp, ...rest } = event;
    return {
      type: type as WORMEntryType,
      timestamp,
      sessionId: "",
      metadata: { source: "auth", ...rest },
    };
  });

export const wormInputFromMemoryEvent = (
  event: MemoryWormEventLike
): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: event.kind as WORMEntryType,
    timestamp: event.at,
    sessionId: "",
    metadata: {
      source: "memory",
      path: event.path,
      correlationId: event.correlationId,
      wormRef: event.wormRef ?? undefined,
      detail: event.detail,
    },
  }));

export const wormInputFromWebEvent = (
  event: WebWormEventLike
): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: event.type as WORMEntryType,
    timestamp: event.ts,
    sessionId: "",
    metadata: {
      source: "web",
      provider: event.provider,
      query: event.query,
      url: event.url,
      reason: event.reason,
      fallback: event.fallback,
      correlationId: event.correlationId,
      ok: event.ok,
      detail: event.detail,
    },
  }));

export const wormInputFromPaymentEvent = (
  entry: PaymentWormEventLike
): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: entry.action as WORMEntryType,
    timestamp: entry.ts,
    sessionId: "",
    metadata: {
      source: "payments",
      category: entry.category,
      summary: entry.summary,
      correlationId: entry.correlationId,
      payload: entry.payload,
    },
  }));

export const wormInputFromInferenceCall = (
  input: InferenceCallLike
): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: "INFERENCE_CALL",
    timestamp: input.timestamp ?? new Date().toISOString(),
    sessionId: input.correlationId ?? "",
    virtualKeyId: input.virtualKeyId,
    metadata: {
      source: "inference",
      modelId: input.modelId,
      provider: input.provider,
      model: input.model,
      tier: input.tier,
      team: input.team,
      tenantId: input.tenantId,
      messageCount: input.messageCount,
      cacheIntent: input.cacheIntent,
      correlationId: input.correlationId,
    },
  }));

export const wormInputFromInferenceResult = (
  input: InferenceResultLike
): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: "INFERENCE_RESULT",
    timestamp: input.timestamp ?? new Date().toISOString(),
    sessionId: input.correlationId ?? "",
    virtualKeyId: input.virtualKeyId,
    metadata: {
      source: "inference",
      modelId: input.modelId,
      provider: input.provider,
      tier: input.tier,
      ok: input.ok,
      latencyMs: input.latencyMs,
      cacheHit: input.cacheHit,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      detail: input.detail,
      correlationId: input.correlationId,
    },
  }));

export const wormInputFromInferenceAuditEntry = (
  entry: InferenceAuditEntryLike
): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: entry.action as WORMEntryType,
    timestamp: entry.ts,
    sessionId: entry.correlationId ?? "",
    metadata: {
      source: "inference",
      category: entry.category,
      summary: entry.summary,
      correlationId: entry.correlationId,
      payload: entry.payload,
    },
  }));

export const wormInputFromToolAttempt = (input: {
  toolName?: string;
  operationId?: string;
  sessionId?: string;
  argKeys?: string[];
  /** Defaults to `execute` when operationId set, else `mcp`. */
  source?: string;
}): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: "TOOL_CALL_ATTEMPT",
    timestamp: new Date().toISOString(),
    sessionId: input.sessionId ?? "",
    metadata: {
      source: input.source ?? (input.operationId ? "execute" : "mcp"),
      toolName: input.toolName,
      operationId: input.operationId,
      argKeys: input.argKeys,
    },
  }));

export const wormInputFromToolResult = (input: {
  toolName?: string;
  operationId?: string;
  sessionId?: string;
  ok: boolean;
  detail?: string;
  source?: string;
}): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: "TOOL_CALL_RESULT",
    timestamp: new Date().toISOString(),
    sessionId: input.sessionId ?? "",
    metadata: {
      source: input.source ?? (input.operationId ? "execute" : "mcp"),
      toolName: input.toolName,
      operationId: input.operationId,
      ok: input.ok,
      detail: input.detail,
    },
  }));

export const wormInputFromPanguardDeny = (input: {
  toolName: string;
  reason?: string;
}): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: "PANGUARD_DENY",
    timestamp: new Date().toISOString(),
    sessionId: "",
    metadata: {
      source: "panguard",
      toolName: input.toolName,
      reason: input.reason ?? `Panguard policy blocked tool: ${input.toolName}`,
    },
  }));

export const wormInputFromPanguardAllow = (input: {
  toolName: string;
}): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: "PANGUARD_ALLOW",
    timestamp: new Date().toISOString(),
    sessionId: "",
    metadata: {
      source: "panguard",
      toolName: input.toolName,
    },
  }));

export const appendAuthEventToWormEffect = (
  event: AuthWormEvent
): Effect.Effect<WORMEntry | null> =>
  Effect.gen(function* () {
    const input = yield* wormInputFromAuthEvent(event);
    return yield* appendProcessWormEffect(input);
  });

export const appendMemoryEventToWormEffect = (
  event: MemoryWormEventLike
): Effect.Effect<WORMEntry | null> =>
  Effect.gen(function* () {
    const input = yield* wormInputFromMemoryEvent(event);
    return yield* appendProcessWormEffect(input);
  });

export const appendWebEventToWormEffect = (
  event: WebWormEventLike
): Effect.Effect<WORMEntry | null> =>
  Effect.gen(function* () {
    const input = yield* wormInputFromWebEvent(event);
    return yield* appendProcessWormEffect(input);
  });

export const appendPaymentEventToWormEffect = (
  entry: PaymentWormEventLike
): Effect.Effect<WORMEntry | null> =>
  Effect.gen(function* () {
    const input = yield* wormInputFromPaymentEvent(entry);
    return yield* appendProcessWormEffect(input);
  });

export const appendInferenceCallToWormEffect = (
  input: InferenceCallLike
): Effect.Effect<WORMEntry | null> =>
  Effect.gen(function* () {
    const body = yield* wormInputFromInferenceCall(input);
    return yield* appendProcessWormEffect(body);
  });

export const appendInferenceResultToWormEffect = (
  input: InferenceResultLike
): Effect.Effect<WORMEntry | null> =>
  Effect.gen(function* () {
    const body = yield* wormInputFromInferenceResult(input);
    return yield* appendProcessWormEffect(body);
  });

export const appendInferenceAuditEntryToWormEffect = (
  entry: InferenceAuditEntryLike
): Effect.Effect<WORMEntry | null> =>
  Effect.gen(function* () {
    const body = yield* wormInputFromInferenceAuditEntry(entry);
    return yield* appendProcessWormEffect(body);
  });

/** Host AuthEventSink — inject into createAuth({ authEventSink }). */
export function createAuthEventWormSink(): (event: AuthWormEvent) => Promise<void> {
  return async (event) => {
    await appendProcessWorm(await Effect.runPromise(wormInputFromAuthEvent(event)));
  };
}

/** Host MemoryWormSink — pass to registerMemoryWormSink. */
export function createMemoryWormSink(): (event: MemoryWormEventLike) => Promise<void> {
  return async (event) => {
    await appendProcessWorm(await Effect.runPromise(wormInputFromMemoryEvent(event)));
  };
}

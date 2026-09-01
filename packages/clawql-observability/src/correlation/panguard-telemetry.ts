/**
 * Phase 4 — correlate Panguard allow/deny decisions with LGTM+ / Langfuse traces.
 * Emits OTLP-shaped log attributes (and optional Loki push) sharing `clawql.correlation_id`
 * with agent tool spans so UnexpectedAgentToolUse alerts can join policy + work traces.
 */

import { Effect } from "effect";

import { ObservabilityError } from "../errors.js";

export type PanguardTelemetryVerdict = "allow" | "deny";

export type PanguardTelemetryEvent = {
  readonly toolName: string;
  readonly verdict: PanguardTelemetryVerdict;
  readonly reason?: string;
  readonly correlationId?: string;
  readonly sessionId?: string;
  readonly timestamp?: string;
};

export type PanguardTelemetryAttributes = {
  readonly "clawql.correlation_id": string;
  readonly "clawql.tool_name": string;
  readonly "clawql.panguard.verdict": PanguardTelemetryVerdict;
  readonly "clawql.panguard.reason"?: string;
  readonly "clawql.session_id"?: string;
  readonly "service.name": "clawql-panguard";
};

export const buildPanguardTelemetryAttributesEffect = (
  event: PanguardTelemetryEvent
): Effect.Effect<PanguardTelemetryAttributes> =>
  Effect.sync(() => {
    const correlationId =
      event.correlationId?.trim() ||
      `panguard:${event.toolName}:${event.timestamp ?? new Date().toISOString()}`;
    const base: PanguardTelemetryAttributes = {
      "clawql.correlation_id": correlationId,
      "clawql.tool_name": event.toolName,
      "clawql.panguard.verdict": event.verdict,
      "service.name": "clawql-panguard",
    };
    return {
      ...base,
      ...(event.reason ? { "clawql.panguard.reason": event.reason } : {}),
      ...(event.sessionId ? { "clawql.session_id": event.sessionId } : {}),
    };
  });

/** Loki push line for Alloy/Loki correlation dashboards. */
export const formatPanguardLokiLineEffect = (
  event: PanguardTelemetryEvent
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const attrs = yield* buildPanguardTelemetryAttributesEffect(event);
    const ts = event.timestamp ?? new Date().toISOString();
    return JSON.stringify({
      ts,
      level: event.verdict === "deny" ? "warn" : "info",
      msg: `panguard_${event.verdict}`,
      ...attrs,
    });
  });

export type EmitPanguardTelemetryOptions = {
  /** When set, POST LogQL push JSON to this Loki endpoint (best-effort). */
  readonly lokiPushUrl?: string;
  readonly fetchImpl?: typeof fetch;
};

/**
 * Emit Panguard decision telemetry. Always succeeds for callers (best-effort).
 * When `lokiPushUrl` is unset, only builds attributes (for span injection).
 */
export const emitPanguardTelemetryEffect = (
  event: PanguardTelemetryEvent,
  options: EmitPanguardTelemetryOptions = {}
): Effect.Effect<{ readonly attributes: PanguardTelemetryAttributes }> =>
  Effect.gen(function* () {
    const attributes = yield* buildPanguardTelemetryAttributesEffect(event);
    const lokiPushUrl = options.lokiPushUrl?.trim();
    if (!lokiPushUrl) {
      return { attributes };
    }

    const line = yield* formatPanguardLokiLineEffect(event);
    const tsNs = `${BigInt(Date.now()) * 1_000_000n}`;
    const body = {
      streams: [
        {
          stream: {
            service_name: "clawql-panguard",
            verdict: event.verdict,
            tool: event.toolName,
          },
          values: [[tsNs, line]],
        },
      ],
    };

    yield* Effect.tryPromise({
      try: async () => {
        const fetchFn = options.fetchImpl ?? fetch;
        const res = await fetchFn(lokiPushUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`Loki push HTTP ${res.status}`);
        }
      },
      catch: (cause) =>
        new ObservabilityError({
          reason: "panguard telemetry Loki push failed",
          cause,
        }),
    }).pipe(Effect.catchAll(() => Effect.void));

    return { attributes };
  });

/** Env-gated Loki push URL for host wiring (`CLAWQL_PANGUARD_TELEMETRY_LOKI_URL`). */
export const resolvePanguardTelemetryLokiUrlEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string | undefined> =>
  Effect.sync(() => {
    const url = env.CLAWQL_PANGUARD_TELEMETRY_LOKI_URL?.trim();
    return url || undefined;
  });

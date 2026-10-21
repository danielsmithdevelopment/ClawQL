import { Effect } from "effect";
import type { OpenAppaConfig } from "./config.js";
import {
  OPENAPPA_PROTOCOL,
  type OpenAppaHookRequest,
  type OpenAppaWireDecision,
} from "./types.js";

export class OpenAppaTransportError extends Error {
  readonly _tag = "OpenAppaTransportError";
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "OpenAppaTransportError";
  }
}

export class OpenAppaProtocolError extends Error {
  readonly _tag = "OpenAppaProtocolError";
  constructor(message: string) {
    super(message);
    this.name = "OpenAppaProtocolError";
  }
}

function isWireDecision(body: unknown): body is OpenAppaWireDecision {
  if (!body || typeof body !== "object") return false;
  const rec = body as Record<string, unknown>;
  return rec.protocol === OPENAPPA_PROTOCOL && typeof rec.decision === "string";
}

/**
 * PROTOCOL=1 `POST {baseUrl}/hook` — absolute IO inside Effect.
 * Sends `Authorization: Bearer` when `config.authToken` is set (required off-loopback).
 */
export function postOpenAppaHookEffect(
  config: OpenAppaConfig,
  request: Omit<OpenAppaHookRequest, "protocol" | "adapter"> & {
    readonly adapter?: OpenAppaHookRequest["adapter"];
  }
): Effect.Effect<OpenAppaWireDecision, OpenAppaTransportError | OpenAppaProtocolError> {
  const body: OpenAppaHookRequest = {
    protocol: OPENAPPA_PROTOCOL,
    adapter: request.adapter ?? config.adapter,
    event: request.event,
    root_id: request.root_id,
    ...(request.child_id ? { child_id: request.child_id } : {}),
    ...(request.tool !== undefined ? { tool: request.tool } : {}),
    ...(request.arguments !== undefined ? { arguments: request.arguments } : {}),
    ...(request.call_id !== undefined ? { call_id: request.call_id } : {}),
    ...(request.outcome !== undefined ? { outcome: request.outcome } : {}),
  };

  return Effect.tryPromise({
    try: async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.authToken) {
        headers.Authorization = `Bearer ${config.authToken}`;
      }
      const res = await fetch(`${config.baseUrl}/hook`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs),
        redirect: "error",
      });
      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch (cause) {
        throw new OpenAppaTransportError(
          `OpenAPPA /hook returned non-JSON (HTTP ${res.status})`,
          res.status,
          cause
        );
      }
      if (!isWireDecision(parsed)) {
        throw new OpenAppaProtocolError(
          `OpenAPPA /hook reply missing protocol=${OPENAPPA_PROTOCOL} decision`
        );
      }
      // refuse arrives as HTTP 409 with a valid WireDecision — return it to the gate.
      if (parsed.decision === "refuse") return parsed;
      if (!res.ok) {
        throw new OpenAppaTransportError(
          `OpenAPPA /hook HTTP ${res.status}: ${parsed.decision}`,
          res.status
        );
      }
      return parsed;
    },
    catch: (cause) => {
      if (cause instanceof OpenAppaTransportError || cause instanceof OpenAppaProtocolError) {
        return cause;
      }
      const name = cause && typeof cause === "object" && "name" in cause ? String(cause.name) : "";
      const msg = cause instanceof Error ? cause.message : String(cause);
      const timedOut = name === "TimeoutError" || /aborted|timeout/i.test(msg);
      return new OpenAppaTransportError(
        timedOut ? `OpenAPPA /hook timed out after ${config.timeoutMs}ms` : msg,
        undefined,
        cause
      );
    },
  });
}

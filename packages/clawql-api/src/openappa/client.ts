import { Effect } from "effect";
import { fetch as undiciFetch, type Agent } from "undici";
import type { OpenAppaConfig } from "./config.js";
import { redactOpenAppaSecretsEffect } from "./config.js";
import { openAppaHttpAgentEffect } from "./http-agent.js";
import { OPENAPPA_PROTOCOL, type OpenAppaHookRequest, type OpenAppaWireDecision } from "./types.js";

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

function toTransportError(
  cause: unknown,
  timeoutMs: number
): OpenAppaTransportError | OpenAppaProtocolError {
  if (cause instanceof OpenAppaTransportError || cause instanceof OpenAppaProtocolError) {
    return cause;
  }
  const name = cause && typeof cause === "object" && "name" in cause ? String(cause.name) : "";
  const msg = cause instanceof Error ? cause.message : String(cause);
  const timedOut = name === "TimeoutError" || /aborted|timeout/i.test(msg);
  return new OpenAppaTransportError(
    timedOut ? `OpenAPPA /hook timed out after ${timeoutMs}ms` : "OpenAPPA /hook transport error",
    undefined,
    cause
  );
}

async function postOnce(
  config: OpenAppaConfig,
  body: OpenAppaHookRequest,
  authToken: string | null,
  dispatcher: Agent
): Promise<{ decision: OpenAppaWireDecision; status: number }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const res = await undiciFetch(`${config.baseUrl}/hook`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
    redirect: "error",
    dispatcher,
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
  return { decision: parsed, status: res.status };
}

/**
 * PROTOCOL=1 `POST {baseUrl}/hook` — keep-alive Agent, tight timeout.
 * Bearer from SecretStore-loaded tokens; HTTP 401 retries previous token (rotation overlap).
 * Error messages never include token material.
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

  return Effect.gen(function* () {
    const dispatcher = yield* openAppaHttpAgentEffect(config.baseUrl);
    const tokenList: (string | null)[] =
      config.authTokens.length > 0 ? [...config.authTokens] : [null];

    const result = yield* Effect.tryPromise({
      try: async () => {
        let lastStatus = 0;
        let lastDecision: OpenAppaWireDecision | null = null;
        for (let i = 0; i < tokenList.length; i++) {
          const { decision, status } = await postOnce(
            config,
            body,
            tokenList[i] ?? null,
            dispatcher
          );
          lastStatus = status;
          lastDecision = decision;
          if (status === 401 && i + 1 < tokenList.length) continue;
          if (decision.decision === "refuse") return decision;
          if (status < 200 || status >= 300) {
            if (status === 401) {
              throw new OpenAppaTransportError("OpenAPPA /hook unauthorized", status);
            }
            throw new OpenAppaTransportError(
              `OpenAPPA /hook HTTP ${status}: ${decision.decision}`,
              status
            );
          }
          return decision;
        }
        if (lastDecision?.decision === "refuse") return lastDecision;
        throw new OpenAppaTransportError(
          `OpenAPPA /hook HTTP ${lastStatus || "unknown"}`,
          lastStatus || undefined
        );
      },
      catch: (cause) => toTransportError(cause, config.timeoutMs),
    });

    return result;
  }).pipe(
    Effect.catch((err) =>
      Effect.gen(function* () {
        if (!(err instanceof OpenAppaTransportError || err instanceof OpenAppaProtocolError)) {
          return yield* Effect.fail(toTransportError(err, config.timeoutMs));
        }
        const safe = yield* redactOpenAppaSecretsEffect(err.message, config.authTokens);
        if (safe === err.message) return yield* Effect.fail(err);
        if (err instanceof OpenAppaTransportError) {
          return yield* Effect.fail(new OpenAppaTransportError(safe, err.status, err.cause));
        }
        return yield* Effect.fail(new OpenAppaProtocolError(safe));
      })
    )
  );
}

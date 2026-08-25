import { Context, Effect, Layer } from "effect";
import { readLokiPushConfig } from "./config.js";
import { LokiPushError } from "./errors.js";

export type LokiLogLine = {
  readonly job: string;
  readonly service: string;
  readonly ts?: string;
  readonly line: string;
};

export type LokiPushRequest = {
  readonly url: string;
  readonly body: string;
  readonly headers: Record<string, string>;
  readonly timeoutMs: number;
};

export function isoToLokiNs(ts: string | undefined, nowMs: number = Date.now()): string {
  const ms = ts ? Date.parse(ts) : Number.NaN;
  const t = Number.isFinite(ms) ? ms : nowMs;
  return String(Math.floor(t * 1e6));
}

export const buildLokiPushRequest = (
  input: LokiLogLine,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<LokiPushRequest | undefined> =>
  Effect.gen(function* () {
    const cfg = yield* readLokiPushConfig(env);
    if (!cfg.enabled || !cfg.url) {
      return undefined;
    }
    const body = JSON.stringify({
      streams: [
        {
          stream: { job: input.job, service: input.service },
          values: [[isoToLokiNs(input.ts), input.line]],
        },
      ],
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (cfg.bearerToken) {
      headers.Authorization = `Bearer ${cfg.bearerToken}`;
    }
    if (cfg.tenantId) {
      headers["X-Scope-OrgID"] = cfg.tenantId;
    }
    return { url: cfg.url, body, headers, timeoutMs: cfg.timeoutMs };
  });

const performLokiPush = (req: LokiPushRequest): Effect.Effect<void, LokiPushError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: req.body,
        signal: AbortSignal.timeout(req.timeoutMs),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
    },
    catch: (cause) =>
      new LokiPushError({
        reason: cause instanceof Error ? cause.message : "Loki push failed",
        cause,
      }),
  });

export class LokiLogPush extends Context.Tag("clawql/core/LokiLogPush")<
  LokiLogPush,
  {
    readonly push: (input: LokiLogLine) => Effect.Effect<void, LokiPushError>;
  }
>() {}

export function lokiLogPushLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<LokiLogPush> {
  return Layer.succeed(
    LokiLogPush,
    LokiLogPush.of({
      push: (input) =>
        Effect.gen(function* () {
          const req = yield* buildLokiPushRequest(input, env);
          if (!req) return;
          yield* performLokiPush(req);
        }),
    })
  );
}

/**
 * Fire-and-forget host façade for Express/MCP/store edges. Domain callers should
 * `yield*` {@link LokiLogPush.push} instead.
 */
export function forkPushLokiLogLine(
  input: LokiLogLine,
  env: NodeJS.ProcessEnv = process.env,
  logLabel = "[clawql-loki]"
): void {
  void Effect.runPromise(
    Effect.gen(function* () {
      const loki = yield* LokiLogPush;
      yield* loki.push(input);
    }).pipe(
      Effect.provide(lokiLogPushLiveLayer(env)),
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error(logLabel, "push failed:", err.reason);
        })
      )
    )
  );
}

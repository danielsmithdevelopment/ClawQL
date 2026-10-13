/**
 * Stamp HTTP parse-complete time onto IncomingMessage via diagnostics_channel
 * `http.server.request.start`, so handlers can measure parse→handler queue delay.
 *
 * Large queue_ms ⇒ event-loop backlog before Express. Late parse_t0 ⇒ client/socket read.
 */

import diagnosticsChannel from "node:diagnostics_channel";
import type { IncomingMessage } from "node:http";
import { Effect } from "effect";

export const CLAWQL_PARSE_START_MS = "__clawqlParseStartMs";
export const CLAWQL_PARSE_T0_ISO = "__clawqlParseT0Iso";

export type IncomingMessageWithParseTiming = IncomingMessage & {
  [CLAWQL_PARSE_START_MS]?: number;
  [CLAWQL_PARSE_T0_ISO]?: string;
};

export type HttpParseTimingStamp = {
  parseStartMs: number;
  parseT0Iso: string;
};

export const httpParseTimingEnabled = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    const timing = ["1", "true", "yes"].includes((env.CLAWQL_HTTP_TIMING ?? "").trim().toLowerCase());
    const slow = Number.parseInt(env.CLAWQL_HTTP_SLOW_MS ?? "0", 10) > 0;
    const force = ["1", "true", "yes"].includes(
      (env.CLAWQL_HTTP_PARSE_TIMING ?? "").trim().toLowerCase()
    );
    return timing || slow || force;
  });

let installed = false;

/**
 * Subscribe once to `http.server.request.start`. Stamps every request; logging is gated
 * at the Express handler. Returns whether a new subscription was installed.
 */
export const installHttpParseTiming = (): Effect.Effect<boolean> =>
  Effect.sync(() => {
    if (installed) return false;
    try {
      const ch = diagnosticsChannel.channel("http.server.request.start");
      ch.subscribe((message: unknown) => {
        const req = (message as { request?: IncomingMessageWithParseTiming } | null)?.request;
        if (!req) return;
        req[CLAWQL_PARSE_START_MS] = performance.now();
        req[CLAWQL_PARSE_T0_ISO] = new Date().toISOString();
      });
      installed = true;
      return true;
    } catch {
      // Bun / older hosts may lack the channel — handlers simply omit queue_ms.
      return false;
    }
  });

export const readHttpParseTiming = (
  req: IncomingMessage
): Effect.Effect<HttpParseTimingStamp | null> =>
  Effect.sync(() => {
    const r = req as IncomingMessageWithParseTiming;
    const parseStartMs = r[CLAWQL_PARSE_START_MS];
    const parseT0Iso = r[CLAWQL_PARSE_T0_ISO];
    if (typeof parseStartMs !== "number" || typeof parseT0Iso !== "string") return null;
    return { parseStartMs, parseT0Iso };
  });

/** Handler-start − parse-complete (ms). Null when stamp missing. */
export const parseToHandlerQueueMs = (
  req: IncomingMessage,
  handlerStartMs: number
): Effect.Effect<number | null> =>
  Effect.gen(function* () {
    const stamp = yield* readHttpParseTiming(req);
    if (!stamp) return null;
    return handlerStartMs - stamp.parseStartMs;
  });

/** Test helper — reset install guard between Vitest cases. */
export const resetHttpParseTimingForTests = (): Effect.Effect<void> =>
  Effect.sync(() => {
    installed = false;
  });

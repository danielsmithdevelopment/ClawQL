/**
 * Istio / ztunnel / waypoint access-log file tail → BurstWatchStub (§8 denial bridging).
 *
 * Hosts point this at an NDJSON access-log path (Fluent Bit / Envoy file sink /
 * ztunnel tee). New lines are parsed via IstioDenialWatchService. Missing path
 * or unreadable file → unavailable (fail-closed — no invented denials).
 *
 * This is the in-repo "watch the mesh telemetry pipeline" path without requiring
 * a live cluster log aggregator API. Policy generation remains forbidden.
 */

import { open, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { Context, Effect, Layer } from "effect";
import type { BurstWatchStub } from "./burst-watch-stub.js";
import {
  IstioDenialWatchService,
  makeIstioDenialWatchService,
  type IstioDenialWatchService as IstioDenialWatchServiceTag,
} from "./istio-denial-adapter.js";
import type { WatchEvent } from "./burst-watch-stub.js";

export type IstioAccessLogTailOptions = {
  /** Absolute or cwd-relative path to NDJSON access log. */
  readonly path: string;
  /** Poll interval ms when following (default 250). */
  readonly pollMs?: number;
  /** When true, process existing file contents from offset 0 before following. */
  readonly fromStart?: boolean;
  readonly onEvent: (event: WatchEvent) => Effect.Effect<void>;
};

export type IstioAccessLogTailHandle = {
  readonly stop: () => void;
  readonly source: "istio-access-log-file";
  readonly path: string;
};

export class IstioAccessLogTailService extends Context.Tag("clawql/IstioAccessLogTailService")<
  IstioAccessLogTailService,
  {
    readonly start: (
      options: IstioAccessLogTailOptions
    ) => Effect.Effect<
      IstioAccessLogTailHandle,
      { readonly _tag: "IstioAccessLogTailUnavailable"; readonly reason: string }
    >;
    /** One-shot read of current file contents (tests / batch bridge). */
    readonly ingestFileOnce: (path: string) => Effect.Effect<
      {
        readonly events: readonly WatchEvent[];
        readonly parseErrors: number;
        readonly skippedNonDenials: number;
      },
      { readonly _tag: "IstioAccessLogTailUnavailable"; readonly reason: string }
    >;
  }
>() {}

async function readNewBytes(
  fh: FileHandle,
  offset: number
): Promise<{ readonly chunk: string; readonly nextOffset: number }> {
  const st = await fh.stat();
  if (st.size < offset) {
    // Truncation / rotation — restart from 0
    offset = 0;
  }
  if (st.size === offset) {
    return { chunk: "", nextOffset: offset };
  }
  const length = st.size - offset;
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, offset);
  return {
    chunk: buf.subarray(0, bytesRead).toString("utf8"),
    nextOffset: offset + bytesRead,
  };
}

function makeTailService(
  denial: Context.Tag.Service<typeof IstioDenialWatchServiceTag>
): Context.Tag.Service<typeof IstioAccessLogTailService> {
  return {
    ingestFileOnce: (path) =>
      Effect.tryPromise({
        try: async () => {
          const fh = await open(path, "r");
          try {
            const st = await fh.stat();
            if (!st.isFile()) {
              throw new Error(`${path} is not a regular file`);
            }
            const buf = Buffer.alloc(st.size);
            await fh.read(buf, 0, st.size, 0);
            return buf.toString("utf8");
          } finally {
            await fh.close();
          }
        },
        catch: (e) => ({
          _tag: "IstioAccessLogTailUnavailable" as const,
          reason: e instanceof Error ? e.message : String(e),
        }),
      }).pipe(Effect.flatMap((body) => denial.ingestNdjson(body))),

    start: (options) =>
      Effect.tryPromise({
        try: async () => {
          try {
            const st = await stat(options.path);
            if (!st.isFile()) {
              throw new Error(`${options.path} is not a regular file`);
            }
          } catch (e) {
            throw new Error(
              e instanceof Error ? e.message : `cannot stat ${options.path}: ${String(e)}`
            );
          }

          const fh = await open(options.path, "r");
          let offset = options.fromStart ? 0 : (await fh.stat()).size;
          let closed = false;
          let carry = "";
          const pollMs = options.pollMs ?? 250;

          const processChunk = async (chunk: string) => {
            carry += chunk;
            const lines = carry.split(/\r?\n/);
            carry = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const result = await Effect.runPromise(denial.ingestLine(line).pipe(Effect.either));
              if (result._tag === "Right" && result.right) {
                await Effect.runPromise(options.onEvent(result.right));
              }
            }
          };

          // Initial catch-up when fromStart
          if (options.fromStart) {
            const { chunk, nextOffset } = await readNewBytes(fh, offset);
            offset = nextOffset;
            await processChunk(chunk);
          }

          const timer = setInterval(() => {
            if (closed) return;
            void (async () => {
              try {
                const { chunk, nextOffset } = await readNewBytes(fh, offset);
                offset = nextOffset;
                if (chunk) await processChunk(chunk);
              } catch {
                /* transient read errors — keep polling until stop */
              }
            })();
          }, pollMs);

          return {
            source: "istio-access-log-file" as const,
            path: options.path,
            stop: () => {
              closed = true;
              clearInterval(timer);
              void fh.close();
            },
          };
        },
        catch: (e) => ({
          _tag: "IstioAccessLogTailUnavailable" as const,
          reason: e instanceof Error ? e.message : String(e),
        }),
      }),
  };
}

export function makeIstioAccessLogTailService(
  denial?: Context.Tag.Service<typeof IstioDenialWatchServiceTag>
): Context.Tag.Service<typeof IstioAccessLogTailService> {
  return makeTailService(denial ?? makeIstioDenialWatchService());
}

export const IstioAccessLogTailLive: Layer.Layer<
  IstioAccessLogTailService,
  never,
  IstioDenialWatchService
> = Layer.effect(
  IstioAccessLogTailService,
  Effect.gen(function* () {
    const denial = yield* IstioDenialWatchService;
    return makeIstioAccessLogTailService(denial);
  })
);

/** Standalone live layer (bundles denial parser). */
export const IstioAccessLogTailStandaloneLive: Layer.Layer<IstioAccessLogTailService> =
  Layer.succeed(IstioAccessLogTailService, makeIstioAccessLogTailService());

export const UnavailableIstioAccessLogTailLive: Layer.Layer<IstioAccessLogTailService> =
  Layer.succeed(IstioAccessLogTailService, {
    start: () =>
      Effect.fail({
        _tag: "IstioAccessLogTailUnavailable" as const,
        reason: "test double — no access-log path",
      }),
    ingestFileOnce: () =>
      Effect.fail({
        _tag: "IstioAccessLogTailUnavailable" as const,
        reason: "test double — no access-log path",
      }),
  });

export function startIstioAccessLogTailOrNull(
  tail: Context.Tag.Service<typeof IstioAccessLogTailService>,
  stub: Context.Tag.Service<typeof BurstWatchStub>,
  options: Omit<IstioAccessLogTailOptions, "onEvent">
): Effect.Effect<IstioAccessLogTailHandle | null> {
  return tail
    .start({
      ...options,
      onEvent: (event) => stub.enqueue(event),
    })
    .pipe(Effect.catchAll(() => Effect.succeed(null)));
}

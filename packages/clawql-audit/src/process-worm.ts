/**
 * Process-scoped durable WORM trail. Env-gated (`CLAWQL_WORM_ENABLED=1`).
 * Appends are best-effort — never fail domain callers.
 */

import { Context, Effect } from "effect";
import type { Semaphore } from "effect/Effect";
import type { WORMAppendInput, WORMEntry } from "./entry.js";
import { AuditError } from "./errors.js";
import {
  createWormTrailConfigFromEnvEffect,
  defaultWormAgentName,
  defaultWormSessionId,
} from "./env-config.js";
import { createWORMAuditTrailEffect, WORMAuditTrailService } from "./trail.js";

type TrailSvc = Context.Tag.Service<typeof WORMAuditTrailService>;

let trailSvc: TrailSvc | null = null;
let appendSem: Semaphore | null = null;
let bootState: "idle" | "booting" | "ready" | "disabled" | "failed" = "idle";
let bootFiber: Promise<TrailSvc | null> | null = null;
let defaultSession = "clawql-host";
let defaultAgent: string | undefined;

export const processWormBootState = (): Effect.Effect<typeof bootState> =>
  Effect.sync(() => bootState);

export const processWormReady = (): Effect.Effect<boolean> =>
  Effect.sync(() => bootState === "ready" && trailSvc !== null);

/** Fill sessionId / agentName when callers omit them. */
export const withProcessWormDefaults = (input: WORMAppendInput): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    ...input,
    sessionId: input.sessionId || defaultSession,
    agentName: input.agentName ?? defaultAgent,
  }));

/**
 * Boot the process trail from env (idempotent). Returns null when disabled / failed.
 */
export const bootProcessWormFromEnvEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<TrailSvc | null, AuditError> =>
  Effect.gen(function* () {
    if (bootState === "ready") return trailSvc;
    if (bootState === "disabled") return null;
    if (bootState === "failed") return null;

    if (bootFiber) {
      return yield* Effect.tryPromise({
        try: () => bootFiber!,
        catch: (cause) => new AuditError({ reason: "WORM boot wait failed", cause }),
      });
    }

    bootState = "booting";
    defaultSession = yield* defaultWormSessionId(env);
    defaultAgent = yield* defaultWormAgentName(env);

    const config = yield* createWormTrailConfigFromEnvEffect(env);
    if (!config) {
      bootState = "disabled";
      return null;
    }

    bootFiber = Effect.runPromise(
      Effect.gen(function* () {
        const sem = yield* Effect.makeSemaphore(1);
        const svc = yield* createWORMAuditTrailEffect(config);
        appendSem = sem;
        trailSvc = svc;
        bootState = "ready";
        return svc;
      }).pipe(
        Effect.tapError(() =>
          Effect.sync(() => {
            bootState = "failed";
            trailSvc = null;
            appendSem = null;
          })
        )
      )
    );

    return yield* Effect.tryPromise({
      try: () => bootFiber!,
      catch: (cause) =>
        new AuditError({
          reason: `WORM boot failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    });
  });

/**
 * Best-effort append. No-ops when trail is not booted / disabled.
 * Never fails — errors are swallowed after optional stderr log.
 */
export const appendProcessWormEffect = (input: WORMAppendInput): Effect.Effect<WORMEntry | null> =>
  Effect.gen(function* () {
    const svc = trailSvc;
    const sem = appendSem;
    if (!svc || !sem || bootState !== "ready") return null;
    const body = yield* withProcessWormDefaults(input);
    return yield* sem
      .withPermits(1)(svc.append(body))
      .pipe(
        Effect.map((e) => e as WORMEntry | null),
        Effect.catchAll((err) =>
          Effect.sync(() => {
            if (process.env.CLAWQL_WORM_DEBUG?.trim() === "1") {
              process.stderr.write(`[clawql-audit] process WORM append failed: ${err.reason}\n`);
            }
            return null;
          })
        )
      );
  });

export const stopProcessWormEffect = (): Effect.Effect<void> =>
  Effect.gen(function* () {
    const svc = trailSvc;
    trailSvc = null;
    appendSem = null;
    bootFiber = null;
    bootState = "idle";
    if (svc) {
      yield* svc.stop().pipe(Effect.catchAll(() => Effect.void));
    }
  });

export const resetProcessWormForTests = (): Effect.Effect<void> => stopProcessWormEffect();

/** Thin host façade — MCP / Express boot. */
export async function bootProcessWormFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Promise<TrailSvc | null> {
  return Effect.runPromise(
    bootProcessWormFromEnvEffect(env).pipe(Effect.catchAll(() => Effect.succeed(null)))
  );
}

/** Thin host façade — AuthEventSink / MemoryWormSink / fire-and-forget. */
export async function appendProcessWorm(input: WORMAppendInput): Promise<WORMEntry | null> {
  return Effect.runPromise(appendProcessWormEffect(input));
}

export async function stopProcessWorm(): Promise<void> {
  return Effect.runPromise(stopProcessWormEffect());
}

export function getProcessWormService(): TrailSvc | null {
  return trailSvc;
}

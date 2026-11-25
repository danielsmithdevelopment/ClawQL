/**
 * Process-scoped durable WORM trail. On by default; set `CLAWQL_WORM_ENABLED=0` to disable.
 * Appends are best-effort unless `CLAWQL_WORM_REQUIRED=1` or `CLAWQL_TIER=regulated`.
 */

import { Context, Effect, Semaphore } from "effect";
import type { WORMAppendInput, WORMEntry } from "./entry.js";
import { AuditError } from "./errors.js";
import {
  createWormTrailConfigFromEnvEffect,
  defaultWormAgentName,
  defaultWormSessionId,
  wormBackendStatusFromConfig,
  type WormBackendStatus,
} from "./env-config.js";
import { createWORMAuditTrailEffect, WORMAuditTrailService } from "./trail.js";

type TrailSvc = Context.Service.Shape<typeof WORMAuditTrailService>;

let trailSvc: TrailSvc | null = null;
let appendSem: Semaphore.Semaphore | null = null;
let bootState: "idle" | "booting" | "ready" | "disabled" | "failed" = "idle";
let bootFiber: Promise<TrailSvc | null> | null = null;
let defaultSession = "clawql-host";
let defaultAgent: string | undefined;
let backendStatus: WormBackendStatus | null = null;
/** Count of swallowed or required-failed appends (exposed on health). */
let appendFailureCount = 0;

function wormRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const tier = env.CLAWQL_TIER?.trim().toLowerCase();
  if (tier === "regulated") return true;
  const raw = env.CLAWQL_WORM_REQUIRED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getProcessWormAppendFailureCount(): number {
  return appendFailureCount;
}

export function processWormRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return wormRequiredFromEnv(env);
}

export const processWormBootState = (): Effect.Effect<typeof bootState> =>
  Effect.sync(() => bootState);

export const processWormReady = (): Effect.Effect<boolean> =>
  Effect.sync(() => bootState === "ready" && trailSvc !== null);

/** Local/remote backend kinds after a successful boot (null when disabled / not booted). */
export const processWormBackendStatus = (): Effect.Effect<WormBackendStatus | null> =>
  Effect.sync(() => backendStatus);

export function getProcessWormBackendStatus(): WormBackendStatus | null {
  return backendStatus;
}

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
      backendStatus = null;
      return null;
    }

    const status = wormBackendStatusFromConfig(config);
    backendStatus = status;
    process.stderr.write(
      `[clawql-audit] process WORM backends: local=${status.local}` +
        `${status.localDurable ? " (durable)" : " (not durable)"}` +
        ` remote=${status.remote}\n`
    );

    bootFiber = Effect.runPromise(
      Effect.gen(function* () {
        const sem = yield* Semaphore.make(1);
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
            backendStatus = null;
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
 * Append to the process trail.
 * - Default: best-effort (returns null on failure / not ready).
 * - When {@link wormRequiredFromEnv}: wait for boot if booting; refuse with AuditError on failure.
 */
export const appendProcessWormEffect = (
  input: WORMAppendInput
): Effect.Effect<WORMEntry | null, AuditError> =>
  Effect.gen(function* () {
    const required = wormRequiredFromEnv();

    if (bootState === "booting" && bootFiber) {
      yield* Effect.tryPromise({
        try: () => bootFiber!,
        catch: (cause) =>
          new AuditError({
            reason: `WORM boot wait failed: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
          }),
      }).pipe(
        Effect.catch((err: AuditError) => {
          if (required) return Effect.fail(err);
          appendFailureCount += 1;
          return Effect.succeed(null);
        })
      );
    }

    const svc = trailSvc;
    const sem = appendSem;
    if (!svc || !sem || bootState !== "ready") {
      if (required) {
        appendFailureCount += 1;
        return yield* Effect.fail(
          new AuditError({
            reason:
              "Process WORM trail is required (CLAWQL_TIER=regulated or CLAWQL_WORM_REQUIRED=1) but is not ready",
          })
        );
      }
      return null;
    }
    const body = yield* withProcessWormDefaults(input);
    return yield* sem
      .withPermits(1)(svc.append(body))
      .pipe(
        Effect.map((e) => e as WORMEntry | null),
        Effect.catch((err: AuditError) => {
          appendFailureCount += 1;
          process.stderr.write(`[clawql-audit] process WORM append failed: ${err.reason}\n`);
          if (required) return Effect.fail(err);
          return Effect.succeed(null);
        })
      );
  });

export const stopProcessWormEffect = (): Effect.Effect<void> =>
  Effect.gen(function* () {
    const svc = trailSvc;
    const sem = appendSem;
    if (svc && sem && bootState === "ready") {
      // Normal shutdown marker (audit 3.03) — distinct from config WORM_DISABLED.
      const body = yield* withProcessWormDefaults({
        type: "WORM_STOPPED",
        timestamp: new Date().toISOString(),
        sessionId: defaultSession,
        metadata: { reason: "process_worm_stop" },
      });
      yield* sem
        .withPermits(1)(svc.append(body))
        .pipe(Effect.catch(() => Effect.void));
    }
    trailSvc = null;
    appendSem = null;
    bootFiber = null;
    backendStatus = null;
    bootState = "idle";
    if (svc) {
      yield* svc.stop().pipe(Effect.catch(() => Effect.void));
    }
  });

export const resetProcessWormForTests = (): Effect.Effect<void> => stopProcessWormEffect();

/**
 * When WORM is configured off, open an existing durable local store (if any) and
 * append a final `WORM_DISABLED` marker (audit 3.03). No-op when no store exists.
 */
export const recordProcessWormDisabledEffect = (
  env: NodeJS.ProcessEnv = process.env,
  reason = "CLAWQL_WORM_ENABLED=0"
): Effect.Effect<void> =>
  Effect.gen(function* () {
    // Temporarily allow boot with WORM enabled against the existing sqlite path,
    // append the marker, then tear down — without flipping process.env permanently.
    const patch: NodeJS.ProcessEnv = {
      ...env,
      CLAWQL_WORM_ENABLED: "1",
      // Prefer existing sqlite; never invent a memory trail just to disable.
      CLAWQL_WORM_LOCAL: env.CLAWQL_WORM_LOCAL?.trim() || "sqlite",
    };
    const prev = {
      enabled: process.env.CLAWQL_WORM_ENABLED,
      local: process.env.CLAWQL_WORM_LOCAL,
      remote: process.env.CLAWQL_WORM_REMOTE,
      tier: process.env.CLAWQL_TIER,
    };
    try {
      process.env.CLAWQL_WORM_ENABLED = "1";
      process.env.CLAWQL_WORM_LOCAL = patch.CLAWQL_WORM_LOCAL;
      // Avoid regulated refusals during the disable marker write.
      delete process.env.CLAWQL_TIER;
      const svc = yield* bootProcessWormFromEnvEffect(patch).pipe(
        Effect.catch(() => Effect.succeed(null))
      );
      if (!svc) return;
      const body = yield* withProcessWormDefaults({
        type: "WORM_DISABLED",
        timestamp: new Date().toISOString(),
        sessionId: defaultSession,
        metadata: { reason },
      });
      if (appendSem) {
        yield* appendSem
          .withPermits(1)(svc.append(body))
          .pipe(Effect.catch(() => Effect.void));
      }
      yield* stopProcessWormEffect();
    } finally {
      if (prev.enabled === undefined) delete process.env.CLAWQL_WORM_ENABLED;
      else process.env.CLAWQL_WORM_ENABLED = prev.enabled;
      if (prev.local === undefined) delete process.env.CLAWQL_WORM_LOCAL;
      else process.env.CLAWQL_WORM_LOCAL = prev.local;
      if (prev.remote === undefined) delete process.env.CLAWQL_WORM_REMOTE;
      else process.env.CLAWQL_WORM_REMOTE = prev.remote;
      if (prev.tier === undefined) delete process.env.CLAWQL_TIER;
      else process.env.CLAWQL_TIER = prev.tier;
    }
  });

/** Thin host façade — MCP / Express boot. */
export async function bootProcessWormFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Promise<TrailSvc | null> {
  return Effect.runPromise(
    bootProcessWormFromEnvEffect(env).pipe(Effect.catch(() => Effect.succeed(null)))
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

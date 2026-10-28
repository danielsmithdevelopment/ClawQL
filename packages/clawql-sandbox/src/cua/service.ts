/**
 * Cua Spaces as an IsolationBackend (ADR 0018 / C1).
 * Mock is CI-default; live posts to an operator-provided cua-spacesd URL.
 * @trycua/cua is never a hard dependency — live is an HTTP façade.
 */

import { createHash } from "node:crypto";
import { Context, Data, Effect, Layer, Ref } from "effect";
import { IsolationBackendError, IsolationBackendService } from "../isolation-backend/interface.js";
import type {
  IsolationAdmitRequest,
  IsolationBackendCapabilities,
  IsolationEscapeProbe,
  IsolationEscapeProbeResult,
  IsolationExecInput,
  IsolationExecResult,
  IsolationSession,
  IsolationSnapshot,
  IsolationTier,
} from "../isolation-backend/types.js";
import { assertCuaLicenseAllowsWorkEffect } from "./pinned-version.js";
import { readCuaConfigEffect, type CuaConfig } from "./types.js";

export class CuaBackendError extends Data.TaggedError("CuaBackendError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class CuaConfigService extends Context.Service<
  CuaConfigService,
  {
    readonly config: () => CuaConfig;
  }
>()("clawql/CuaConfigService") {}

type SessionStore = Map<string, IsolationSession>;
type SnapshotStore = Map<string, IsolationSnapshot & { readonly worktreeMount?: string }>;

function nowIso(): string {
  return new Date().toISOString();
}

function digestOf(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function makeSession(
  request: IsolationAdmitRequest,
  backend: IsolationBackendCapabilities["backend"] = "cua"
): IsolationSession {
  const t = nowIso();
  return {
    sessionId: request.sessionId,
    backend,
    tier: request.tier,
    state: "running",
    worktreeMount: request.worktreePath,
    createdAt: t,
    lastTransitionAt: t,
    trialId: request.trialId,
  };
}

const CUA_CAPS: IsolationBackendCapabilities = {
  backend: "cua",
  supportsSnapshot: true,
  supportsFork: true,
  supportsTiers: ["container", "microvm", "full-vm"],
  publishGradeNumbersAllowed: false,
};

function defaultEscapeResult(probe: IsolationEscapeProbe): IsolationEscapeProbeResult {
  // Mock / contract: every escape attempt is blocked or forced through the gateway.
  return {
    kind: probe.kind,
    target: probe.target,
    blockedOrProxied: true,
    detail: `cua-mock: ${probe.kind} to ${probe.target} denied (egress deny-all except gateway proxy)`,
  };
}

/**
 * In-process Cua mock implementing IsolationBackendService.
 * Exercises admit / mount / exec / snapshot / restore / fork / escape for CI.
 */
export function createMockCuaIsolationLayer(
  config: CuaConfig
): Layer.Layer<IsolationBackendService | CuaConfigService> {
  return Layer.merge(
    Layer.succeed(CuaConfigService, { config: () => config }),
    Layer.effect(
      IsolationBackendService,
      Effect.gen(function* () {
        const sessions = yield* Ref.make<SessionStore>(new Map());
        const snapshots = yield* Ref.make<SnapshotStore>(new Map());

        const getSession = (sessionId: string) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(sessions);
            const cur = map.get(sessionId);
            if (!cur || cur.state === "terminated") {
              return yield* Effect.fail(
                new IsolationBackendError({
                  reason: `unknown or terminated Cua session: ${sessionId}`,
                })
              );
            }
            return cur;
          });

        const putSession = (session: IsolationSession) =>
          Ref.update(sessions, (m) => {
            const next = new Map(m);
            next.set(session.sessionId, session);
            return next;
          });

        return {
          capabilities: () => CUA_CAPS,
          admit: (request) =>
            Effect.gen(function* () {
              yield* assertCuaLicenseAllowsWorkEffect().pipe(
                Effect.mapError((e) => new IsolationBackendError({ reason: e.reason }))
              );
              if (!config.enabled) {
                return yield* Effect.fail(
                  new IsolationBackendError({ reason: "Cua backend disabled" })
                );
              }
              if (!CUA_CAPS.supportsTiers.includes(request.tier)) {
                return yield* Effect.fail(
                  new IsolationBackendError({ reason: `unsupported tier: ${request.tier}` })
                );
              }
              const session = makeSession({
                ...request,
                tier: request.tier,
                worktreePath: request.worktreePath,
              });
              yield* putSession(session);
              return session;
            }),
          mountWorktree: (sessionId, worktreePath) =>
            Effect.gen(function* () {
              const cur = yield* getSession(sessionId);
              const session: IsolationSession = {
                ...cur,
                worktreeMount: worktreePath,
                lastTransitionAt: nowIso(),
              };
              yield* putSession(session);
              return session;
            }),
          exec: (input) =>
            Effect.gen(function* () {
              const cur = yield* getSession(input.sessionId);
              const resumedFromSnapshot = Boolean(cur.parentSnapshotId);
              const result: IsolationExecResult = {
                stdout: `[cua:${cur.tier}:mock] ok language=${input.language} bytes=${Buffer.byteLength(input.code, "utf8")} mount=${cur.worktreeMount ?? ""}\n`,
                stderr: "",
                exitCode: 0,
                success: true,
                sessionId: cur.sessionId,
                backend: "cua",
                tier: cur.tier,
                resumedFromSnapshot,
              };
              return result;
            }),
          snapshot: (sessionId) =>
            Effect.gen(function* () {
              const cur = yield* getSession(sessionId);
              const snapshotId = `snap-${digestOf({ sessionId, at: nowIso() })}`;
              const snap: IsolationSnapshot & { worktreeMount?: string } = {
                snapshotId,
                sessionId,
                backend: "cua",
                tier: cur.tier,
                createdAt: nowIso(),
                payloadDigest: digestOf({
                  sessionId,
                  tier: cur.tier,
                  worktreeMount: cur.worktreeMount,
                }),
                worktreeMount: cur.worktreeMount,
              };
              yield* Ref.update(snapshots, (m) => {
                const next = new Map(m);
                next.set(snapshotId, snap);
                return next;
              });
              return snap;
            }),
          restore: (snapshotId) =>
            Effect.gen(function* () {
              const map = yield* Ref.get(snapshots);
              const snap = map.get(snapshotId);
              if (!snap) {
                return yield* Effect.fail(
                  new IsolationBackendError({ reason: `unknown snapshot: ${snapshotId}` })
                );
              }
              const sessionId = `${snap.sessionId}-restored-${snap.snapshotId.slice(-8)}`;
              const session: IsolationSession = {
                sessionId,
                backend: "cua",
                tier: snap.tier,
                state: "running",
                worktreeMount: snap.worktreeMount,
                createdAt: nowIso(),
                lastTransitionAt: nowIso(),
                parentSnapshotId: snapshotId,
              };
              yield* putSession(session);
              return session;
            }),
          fork: (snapshotId, trialId) =>
            Effect.gen(function* () {
              const map = yield* Ref.get(snapshots);
              const snap = map.get(snapshotId);
              if (!snap) {
                return yield* Effect.fail(
                  new IsolationBackendError({ reason: `unknown snapshot: ${snapshotId}` })
                );
              }
              const sessionId = `${snap.sessionId}-trial-${trialId}`;
              const session: IsolationSession = {
                sessionId,
                backend: "cua",
                tier: snap.tier,
                state: "running",
                worktreeMount: snap.worktreeMount,
                createdAt: nowIso(),
                lastTransitionAt: nowIso(),
                parentSnapshotId: snapshotId,
                trialId,
              };
              yield* putSession(session);
              return session;
            }),
          destroy: (sessionId) =>
            Effect.gen(function* () {
              const cur = yield* getSession(sessionId);
              const session: IsolationSession = {
                ...cur,
                state: "terminated",
                lastTransitionAt: nowIso(),
              };
              yield* putSession(session);
              return session;
            }),
          probeEscape: (sessionId, probes) =>
            Effect.gen(function* () {
              yield* getSession(sessionId);
              return probes.map(defaultEscapeResult);
            }),
        };
      })
    )
  );
}

/**
 * Live HTTP façade to cua-spacesd. Shape is ClawQL-stable; map to upstream
 * Spaces APIs as the daemon contract settles. Missing URL falls back to mock.
 */
export function createLiveCuaIsolationLayer(
  config: CuaConfig
): Layer.Layer<IsolationBackendService | CuaConfigService> {
  if (!config.controlPlaneUrl || !config.apiToken) {
    return createMockCuaIsolationLayer({ ...config, mode: "mock" });
  }

  const base = config.controlPlaneUrl.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${config.apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const postJson = <T>(path: string, body?: unknown) =>
    Effect.gen(function* () {
      const res = yield* Effect.tryPromise({
        try: () =>
          fetch(`${base}${path}`, {
            method: "POST",
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
        catch: (cause) =>
          new IsolationBackendError({ reason: `Cua live fetch failed: ${path}`, cause }),
      });
      if (!res.ok) {
        return yield* Effect.fail(
          new IsolationBackendError({ reason: `Cua live HTTP ${res.status}: ${path}` })
        );
      }
      return (yield* Effect.tryPromise({
        try: () => res.json() as Promise<T>,
        catch: (cause) =>
          new IsolationBackendError({ reason: `Cua live JSON failed: ${path}`, cause }),
      })) as T;
    });

  return Layer.merge(
    Layer.succeed(CuaConfigService, { config: () => config }),
    Layer.succeed(IsolationBackendService, {
      capabilities: () => CUA_CAPS,
      admit: (request) => postJson<IsolationSession>("/v1/spaces/admit", request),
      mountWorktree: (sessionId, worktreePath) =>
        postJson<IsolationSession>(`/v1/spaces/${encodeURIComponent(sessionId)}/mount`, {
          worktreePath,
        }),
      exec: (input) =>
        postJson<IsolationExecResult>(
          `/v1/spaces/${encodeURIComponent(input.sessionId)}/exec`,
          input
        ),
      snapshot: (sessionId) =>
        postJson<IsolationSnapshot>(`/v1/spaces/${encodeURIComponent(sessionId)}/snapshot`),
      restore: (snapshotId) =>
        postJson<IsolationSession>(`/v1/snapshots/${encodeURIComponent(snapshotId)}/restore`),
      fork: (snapshotId, trialId) =>
        postJson<IsolationSession>(`/v1/snapshots/${encodeURIComponent(snapshotId)}/fork`, {
          trialId,
        }),
      destroy: (sessionId) =>
        postJson<IsolationSession>(`/v1/spaces/${encodeURIComponent(sessionId)}/destroy`),
      probeEscape: (sessionId, probes) =>
        postJson<IsolationEscapeProbeResult[]>(
          `/v1/spaces/${encodeURIComponent(sessionId)}/probe-escape`,
          { probes }
        ),
    })
  );
}

export function cuaIsolationLiveFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<Layer.Layer<IsolationBackendService | CuaConfigService>> {
  return Effect.gen(function* () {
    const cfg = yield* readCuaConfigEffect(env);
    return cfg.mode === "live"
      ? createLiveCuaIsolationLayer(cfg)
      : createMockCuaIsolationLayer(cfg);
  });
}

/** Sync façade for Layer construction at host edges. */
export function cuaIsolationLayerFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<IsolationBackendService | CuaConfigService> {
  return Effect.runSync(cuaIsolationLiveFromEnv(env));
}

/** Map IsolationTier for callers that only have a string. */
export function resolveCuaTier(tier: IsolationTier | undefined, config: CuaConfig): IsolationTier {
  return tier ?? config.defaultTier;
}

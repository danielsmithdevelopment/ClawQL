/**
 * In-process IsolationBackend mock for open backends (Firecracker, gVisor,
 * Apple container, Lima). Same admit/mount/exec/snapshot/fork/escape surface.
 */

import { createHash } from "node:crypto";
import { Effect, Layer, Ref } from "effect";
import { IsolationBackendError, IsolationBackendService } from "./interface.js";
import { getIsolationBackendPin } from "./license-registry.js";
import type {
  IsolationAdmitRequest,
  IsolationBackendCapabilities,
  IsolationBackendId,
  IsolationEscapeProbe,
  IsolationEscapeProbeResult,
  IsolationExecResult,
  IsolationSession,
  IsolationSnapshot,
  IsolationTier,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function digestOf(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function defaultEscapeResult(
  backend: IsolationBackendId,
  probe: IsolationEscapeProbe
): IsolationEscapeProbeResult {
  return {
    kind: probe.kind,
    target: probe.target,
    blockedOrProxied: true,
    detail: `${backend}-mock: ${probe.kind} to ${probe.target} denied (egress deny-all except gateway proxy)`,
  };
}

function capabilitiesFor(backend: IsolationBackendId): IsolationBackendCapabilities {
  const pin = getIsolationBackendPin(backend === "mock" ? "firecracker" : backend);
  const tiers: IsolationTier[] =
    backend === "firecracker"
      ? ["microvm"]
      : backend === "gvisor"
        ? ["gvisor"]
        : backend === "apple-container"
          ? ["container"]
          : backend === "lima"
            ? ["full-vm"]
            : ["container", "microvm", "full-vm", "gvisor"];
  return {
    backend,
    supportsSnapshot:
      backend === "firecracker" || backend === "apple-container" || backend === "lima",
    supportsFork: backend === "firecracker" || backend === "apple-container" || backend === "lima",
    supportsTiers: tiers,
    publishGradeNumbersAllowed: pin.publishGradeOnDedicatedLinux,
    licenseSpdx: pin.licenseSpdx,
    pinnedVersion: pin.pinnedVersion,
  };
}

function makeSession(
  request: IsolationAdmitRequest,
  backend: IsolationBackendId
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

type SessionStore = Map<string, IsolationSession>;
type SnapshotStore = Map<string, IsolationSnapshot & { readonly worktreeMount?: string }>;

export type MockIsolationBackendOptions = {
  readonly backend: Exclude<IsolationBackendId, "mock" | "agent-substrate">;
  readonly enabled?: boolean;
};

/**
 * Mock layer implementing IsolationBackendService for one open backend id.
 */
export function createMockOpenIsolationLayer(
  opts: MockIsolationBackendOptions
): Layer.Layer<IsolationBackendService> {
  const backend = opts.backend;
  const enabled = opts.enabled !== false;
  const caps = capabilitiesFor(backend);

  return Layer.effect(
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
                reason: `unknown or terminated ${backend} session: ${sessionId}`,
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
        capabilities: () => caps,
        admit: (request) =>
          Effect.gen(function* () {
            if (!enabled) {
              return yield* Effect.fail(
                new IsolationBackendError({ reason: `${backend} backend disabled` })
              );
            }
            if (!caps.supportsTiers.includes(request.tier)) {
              return yield* Effect.fail(
                new IsolationBackendError({
                  reason: `${backend} does not support tier ${request.tier}`,
                })
              );
            }
            const session = makeSession(request, backend);
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
            const result: IsolationExecResult = {
              stdout: `[${backend}:${cur.tier}:mock] ok language=${input.language} bytes=${Buffer.byteLength(input.code, "utf8")} mount=${cur.worktreeMount ?? ""} pin=${caps.pinnedVersion}\n`,
              stderr: "",
              exitCode: 0,
              success: true,
              sessionId: cur.sessionId,
              backend,
              tier: cur.tier,
              resumedFromSnapshot: Boolean(cur.parentSnapshotId),
            };
            return result;
          }),
        snapshot: (sessionId) =>
          Effect.gen(function* () {
            if (!caps.supportsSnapshot) {
              return yield* Effect.fail(
                new IsolationBackendError({ reason: `${backend} does not support snapshot` })
              );
            }
            const cur = yield* getSession(sessionId);
            const snapshotId = `snap-${digestOf({ backend, sessionId, at: nowIso() })}`;
            const snap: IsolationSnapshot & { worktreeMount?: string } = {
              snapshotId,
              sessionId,
              backend,
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
              backend,
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
            if (!caps.supportsFork) {
              return yield* Effect.fail(
                new IsolationBackendError({ reason: `${backend} does not support fork` })
              );
            }
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
              backend,
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
            return probes.map((p) => defaultEscapeResult(backend, p));
          }),
      };
    })
  );
}

export function createMockFirecrackerLayer(): Layer.Layer<IsolationBackendService> {
  return createMockOpenIsolationLayer({ backend: "firecracker" });
}

export function createMockGvisorLayer(): Layer.Layer<IsolationBackendService> {
  return createMockOpenIsolationLayer({ backend: "gvisor" });
}

export function createMockAppleContainerLayer(): Layer.Layer<IsolationBackendService> {
  return createMockOpenIsolationLayer({ backend: "apple-container" });
}

export function createMockLimaLayer(): Layer.Layer<IsolationBackendService> {
  return createMockOpenIsolationLayer({ backend: "lima" });
}

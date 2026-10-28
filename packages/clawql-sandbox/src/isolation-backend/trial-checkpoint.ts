/**
 * C2 — fork durability-comparison pilot trials from one checkpoint so every
 * arm starts from identical state. Thousand-trial publish runs stay on Linux.
 */

import { Context, Effect, Layer, Ref } from "effect";
import { Data } from "effect";
import {
  IsolationBackendError,
  IsolationBackendService,
} from "./interface.js";
import type {
  IsolationSession,
  IsolationSnapshot,
  IsolationTier,
} from "./types.js";
import { collectIsolationHostEvidenceEffect } from "./host-evidence.js";
import type { IsolationHostEvidence } from "./host-evidence.js";

export class TrialCheckpointError extends Data.TaggedError("TrialCheckpointError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type TrialArm = {
  readonly trialId: string;
  readonly session: IsolationSession;
};

export type TrialCheckpoint = {
  readonly checkpointId: string;
  readonly snapshot: IsolationSnapshot;
  readonly sourceSessionId: string;
  readonly tier: IsolationTier;
  readonly createdAt: string;
  readonly host: IsolationHostEvidence;
  /** Follows backend pin: false on Mac VMs; true only for dedicated-Linux Firecracker/gVisor. */
  readonly publishGradeAllowed: boolean;
};

export class TrialCheckpointService extends Context.Service<
  TrialCheckpointService,
  {
    readonly createCheckpoint: (
      sessionId: string
    ) => Effect.Effect<TrialCheckpoint, TrialCheckpointError | IsolationBackendError>;
    readonly forkArms: (
      checkpointId: string,
      trialIds: readonly string[]
    ) => Effect.Effect<readonly TrialArm[], TrialCheckpointError | IsolationBackendError>;
    readonly get: (
      checkpointId: string
    ) => Effect.Effect<TrialCheckpoint, TrialCheckpointError>;
    readonly list: () => Effect.Effect<readonly TrialCheckpoint[]>;
  }
>()("clawql/TrialCheckpointService") {}

export function createTrialCheckpointLayer(): Layer.Layer<
  TrialCheckpointService,
  never,
  IsolationBackendService
> {
  return Layer.effect(
    TrialCheckpointService,
    Effect.gen(function* () {
      const backend = yield* IsolationBackendService;
      const store = yield* Ref.make<Map<string, TrialCheckpoint>>(new Map());

      return {
        createCheckpoint: (sessionId) =>
          Effect.gen(function* () {
            const snap = yield* backend.snapshot(sessionId);
            const host = yield* collectIsolationHostEvidenceEffect(snap.backend);
            const checkpoint: TrialCheckpoint = {
              checkpointId: `ckpt-${snap.snapshotId}`,
              snapshot: snap,
              sourceSessionId: sessionId,
              tier: snap.tier,
              createdAt: new Date().toISOString(),
              host,
              publishGradeAllowed: host.publishGradeAllowed,
            };
            yield* Ref.update(store, (m) => {
              const next = new Map(m);
              next.set(checkpoint.checkpointId, checkpoint);
              return next;
            });
            return checkpoint;
          }),
        forkArms: (checkpointId, trialIds) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(store);
            const ckpt = map.get(checkpointId);
            if (!ckpt) {
              return yield* Effect.fail(
                new TrialCheckpointError({ reason: `unknown checkpoint: ${checkpointId}` })
              );
            }
            const arms: TrialArm[] = [];
            for (const trialId of trialIds) {
              const session = yield* backend.fork(ckpt.snapshot.snapshotId, trialId);
              arms.push({ trialId, session });
            }
            // Identical parent snapshot for every arm.
            const parents = new Set(arms.map((a) => a.session.parentSnapshotId));
            if (parents.size !== 1 || !parents.has(ckpt.snapshot.snapshotId)) {
              return yield* Effect.fail(
                new TrialCheckpointError({
                  reason: "forked arms do not share the checkpoint snapshot",
                })
              );
            }
            return arms;
          }),
        get: (checkpointId) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(store);
            const ckpt = map.get(checkpointId);
            if (!ckpt) {
              return yield* Effect.fail(
                new TrialCheckpointError({ reason: `unknown checkpoint: ${checkpointId}` })
              );
            }
            return ckpt;
          }),
        list: () =>
          Ref.get(store).pipe(Effect.map((m) => [...m.values()] as readonly TrialCheckpoint[])),
      };
    })
  );
}

/** Pilot helper: admit → mount → checkpoint → fork N arms (default N=50). */
export function forkPilotTrialsEffect(
  opts: {
    readonly sessionId: string;
    readonly tier: IsolationTier;
    readonly worktreePath: string;
    readonly armCount?: number;
    readonly armPrefix?: string;
  }
): Effect.Effect<
  { readonly checkpoint: TrialCheckpoint; readonly arms: readonly TrialArm[] },
  TrialCheckpointError | IsolationBackendError,
  IsolationBackendService | TrialCheckpointService
> {
  return Effect.gen(function* () {
    const backend = yield* IsolationBackendService;
    const trials = yield* TrialCheckpointService;
    const n = opts.armCount ?? 50;
    const prefix = opts.armPrefix ?? "pilot";
    yield* backend.admit({
      sessionId: opts.sessionId,
      tier: opts.tier,
      worktreePath: opts.worktreePath,
    });
    yield* backend.mountWorktree(opts.sessionId, opts.worktreePath);
    const checkpoint = yield* trials.createCheckpoint(opts.sessionId);
    const trialIds = Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(3, "0")}`);
    const arms = yield* trials.forkArms(checkpoint.checkpointId, trialIds);
    return { checkpoint, arms };
  });
}

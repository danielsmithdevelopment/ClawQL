/**
 * IsolationBackendService — one backend among several (ADR 0018).
 * Presence / approvals stay on the host; Spaces never host them.
 */

import { Context, Effect } from "effect";
import { Data } from "effect";
import type {
  IsolationAdmitRequest,
  IsolationBackendCapabilities,
  IsolationEscapeProbe,
  IsolationEscapeProbeResult,
  IsolationExecInput,
  IsolationExecResult,
  IsolationSession,
  IsolationSnapshot,
} from "./types.js";

export class IsolationBackendError extends Data.TaggedError("IsolationBackendError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class IsolationBackendService extends Context.Service<
  IsolationBackendService,
  {
    readonly capabilities: () => IsolationBackendCapabilities;
    /** Admit a session and create a Space at the requested tier. */
    readonly admit: (
      request: IsolationAdmitRequest
    ) => Effect.Effect<IsolationSession, IsolationBackendError>;
    readonly mountWorktree: (
      sessionId: string,
      worktreePath: string
    ) => Effect.Effect<IsolationSession, IsolationBackendError>;
    readonly exec: (
      input: IsolationExecInput
    ) => Effect.Effect<IsolationExecResult, IsolationBackendError>;
    readonly snapshot: (
      sessionId: string
    ) => Effect.Effect<IsolationSnapshot, IsolationBackendError>;
    readonly restore: (
      snapshotId: string
    ) => Effect.Effect<IsolationSession, IsolationBackendError>;
    /** Fork a checkpoint into an identical trial arm (C2). */
    readonly fork: (
      snapshotId: string,
      trialId: string
    ) => Effect.Effect<IsolationSession, IsolationBackendError>;
    readonly destroy: (
      sessionId: string
    ) => Effect.Effect<IsolationSession, IsolationBackendError>;
    /** Escape / bypass probes from inside the Space (C4 / O2). */
    readonly probeEscape: (
      sessionId: string,
      probes: readonly IsolationEscapeProbe[]
    ) => Effect.Effect<readonly IsolationEscapeProbeResult[], IsolationBackendError>;
  }
>()("clawql/IsolationBackendService") {}

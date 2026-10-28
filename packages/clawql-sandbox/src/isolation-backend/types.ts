/**
 * Shared isolation-backend contract (ADR 0018).
 * Cua, Agent Substrate, and future Firecracker / Apple-container backends
 * implement the same surface so conformance tests run against every backend.
 */

import type { SandboxCodeToolInput } from "../types.js";

/** Isolation backends ClawQL can drive. Cua is optional — never a hard dependency. */
export type IsolationBackendId =
  "cua" | "agent-substrate" | "firecracker" | "apple-container" | "mock";

/**
 * Space / guest isolation tier.
 * Honesty: container-tier Spaces share one Linux VM kernel — do not claim
 * kernel isolation between container-tier Spaces.
 */
export type IsolationTier = "container" | "microvm" | "full-vm";

export type IsolationSessionState = "admitted" | "running" | "suspended" | "terminated";

export type IsolationSession = {
  readonly sessionId: string;
  readonly backend: IsolationBackendId;
  readonly tier: IsolationTier;
  readonly state: IsolationSessionState;
  readonly worktreeMount?: string;
  readonly createdAt: string;
  readonly lastTransitionAt: string;
  /** Snapshot this session was forked/restored from, if any. */
  readonly parentSnapshotId?: string;
  /** Durability-trial arm id when forked from a checkpoint (C2). */
  readonly trialId?: string;
};

export type IsolationSnapshot = {
  readonly snapshotId: string;
  readonly sessionId: string;
  readonly backend: IsolationBackendId;
  readonly tier: IsolationTier;
  readonly createdAt: string;
  /** Opaque backend payload (mock stores sequence cursor + mounts). */
  readonly payloadDigest: string;
};

export type IsolationAdmitRequest = {
  readonly sessionId: string;
  readonly tier: IsolationTier;
  readonly worktreePath?: string;
  readonly trialId?: string;
};

export type IsolationExecResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly success: boolean;
  readonly sessionId: string;
  readonly backend: IsolationBackendId;
  readonly tier: IsolationTier;
  readonly resumedFromSnapshot: boolean;
};

export type IsolationExecInput = SandboxCodeToolInput & {
  readonly sessionId: string;
};

/** Egress / host-escape probe kinds for C4 (gateway no-bypass) and O2. */
export type IsolationEscapeProbeKind =
  | "direct-ip"
  | "raw-dns"
  | "ipv6"
  | "hardcoded-endpoint"
  | "host-file-outside-worktree"
  | "runner-socket"
  | "approval-service"
  | "presence-helper"
  | "journal-keys";

export type IsolationEscapeProbe = {
  readonly kind: IsolationEscapeProbeKind;
  /** Target the guest attempts (IP, hostname, path, socket). */
  readonly target: string;
};

export type IsolationEscapeProbeResult = {
  readonly kind: IsolationEscapeProbeKind;
  readonly target: string;
  /** True when the attempt failed or was forced through the gateway proxy. */
  readonly blockedOrProxied: boolean;
  readonly detail: string;
};

export type IsolationBackendCapabilities = {
  readonly backend: IsolationBackendId;
  readonly supportsSnapshot: boolean;
  readonly supportsFork: boolean;
  readonly supportsTiers: readonly IsolationTier[];
  /** Publish-grade latency/density numbers must not come from this backend. */
  readonly publishGradeNumbersAllowed: boolean;
};

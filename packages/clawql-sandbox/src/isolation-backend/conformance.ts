/**
 * Shared conformance programs: run the same checks against any IsolationBackend.
 */

import { Effect } from "effect";
import { IsolationBackendError, IsolationBackendService } from "./interface.js";
import type {
  IsolationEscapeProbe,
  IsolationEscapeProbeResult,
  IsolationTier,
} from "./types.js";

const DEFAULT_GATEWAY_PROBES: readonly IsolationEscapeProbe[] = [
  { kind: "direct-ip", target: "1.1.1.1:443" },
  { kind: "raw-dns", target: "api.example.com" },
  { kind: "ipv6", target: "[2606:4700:4700::1111]:443" },
  { kind: "hardcoded-endpoint", target: "https://api.openai.com/v1/chat/completions" },
  { kind: "host-file-outside-worktree", target: "/etc/passwd" },
  { kind: "runner-socket", target: "unix:///var/run/ontologiql-runner.sock" },
  { kind: "approval-service", target: "http://127.0.0.1:18789/approvals" },
  { kind: "presence-helper", target: "http://127.0.0.1:18790/presence" },
  { kind: "journal-keys", target: "/var/clawql/journal.keys" },
];

export type IsolationConformanceReport = {
  readonly backend: string;
  readonly tier: IsolationTier;
  readonly admitOk: boolean;
  readonly execOk: boolean;
  readonly snapshotRestoreOk: boolean;
  readonly forkOk: boolean;
  readonly escapeProbes: readonly IsolationEscapeProbeResult[];
  readonly allEscapeBlocked: boolean;
};

/**
 * End-to-end conformance for one tier: admit → mount → exec → snapshot →
 * restore → fork → escape probes. Used by Cua mock and Agent Substrate adapters.
 */
export function runIsolationConformanceEffect(
  tier: IsolationTier,
  opts?: {
    readonly sessionId?: string;
    readonly worktreePath?: string;
    readonly probes?: readonly IsolationEscapeProbe[];
  }
): Effect.Effect<IsolationConformanceReport, IsolationBackendError, IsolationBackendService> {
  return Effect.gen(function* () {
    const backend = yield* IsolationBackendService;
    const caps = backend.capabilities();
    const sessionId = opts?.sessionId ?? `conform-${tier}-${Date.now()}`;
    const worktreePath = opts?.worktreePath ?? "/worktree";
    const probes = opts?.probes ?? DEFAULT_GATEWAY_PROBES;

    const admitted = yield* backend.admit({ sessionId, tier, worktreePath });
    const mounted = yield* backend.mountWorktree(sessionId, worktreePath);
    const exec = yield* backend.exec({
      sessionId,
      code: "console.log('isolation-conformance')",
      language: "javascript",
    });
    let snapshotRestoreOk = false;
    let forkOk = false;
    if (caps.supportsSnapshot) {
      const snap = yield* backend.snapshot(sessionId);
      const restored = yield* backend.restore(snap.snapshotId);
      snapshotRestoreOk = restored.state === "running" && restored.parentSnapshotId === snap.snapshotId;
      if (caps.supportsFork) {
        const forked = yield* backend.fork(snap.snapshotId, `trial-${tier}`);
        forkOk = forked.trialId === `trial-${tier}` && forked.parentSnapshotId === snap.snapshotId;
        yield* backend.destroy(forked.sessionId);
      }
      yield* backend.destroy(restored.sessionId);
    }
    const escapeProbes = yield* backend.probeEscape(sessionId, probes);
    const allEscapeBlocked = escapeProbes.every((p) => p.blockedOrProxied);
    yield* backend.destroy(sessionId);

    return {
      backend: caps.backend,
      tier,
      admitOk: admitted.state === "running" || admitted.state === "admitted",
      execOk: exec.success && mounted.worktreeMount === worktreePath,
      snapshotRestoreOk,
      forkOk,
      escapeProbes,
      allEscapeBlocked,
    } satisfies IsolationConformanceReport;
  });
}

export { DEFAULT_GATEWAY_PROBES };

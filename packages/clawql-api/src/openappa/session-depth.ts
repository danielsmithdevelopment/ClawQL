import { Effect } from "effect";

/**
 * Per-root OpenAPPA call ordinal (tool_call count) for latency-vs-session-length
 * observability. ClawQL never rotates root_id to reset this — policy continuity
 * requires one trajectory per MCP session.
 */

const depthByRoot = new Map<string, number>();

export function resetOpenAppaSessionDepthForTests(): void {
  depthByRoot.clear();
}

export function openAppaSessionDepthEffect(rootId: string): Effect.Effect<number> {
  return Effect.sync(() => depthByRoot.get(rootId) ?? 0);
}

/** Increment after a successful tool_call round-trip; returns the new 1-based ordinal. */
export function openAppaRecordSessionCallEffect(rootId: string): Effect.Effect<number> {
  return Effect.sync(() => {
    const next = (depthByRoot.get(rootId) ?? 0) + 1;
    depthByRoot.set(rootId, next);
    return next;
  });
}

/**
 * Warn when sidecar latency grows with session depth (known OpenAPPA trajectory cost).
 * Does not change the decision — operators must fix growth in the sidecar, not rotate roots.
 */
export function openAppaMaybeWarnTrajectoryGrowthEffect(
  rootId: string,
  depth: number,
  elapsedMs: number
): Effect.Effect<void> {
  return Effect.sync(() => {
    // Rough linear model from loopback curve: ~0.03–0.04 ms × depth.
    // Warn once per power-of-two depth when elapsed is clearly elevated.
    if (depth < 64 || elapsedMs < 40) return;
    const isPow2 = (depth & (depth - 1)) === 0;
    if (!isPow2) return;
    process.stderr.write(
      `[clawql-openappa] trajectory growth: root=${rootId.slice(0, 64)} depth=${depth} hook_ms=${elapsedMs.toFixed(1)} — ` +
        `per-call cost grows with session length; do not rotate root_id (drops denials/approvals). ` +
        `Needs OpenAPPA sliding-window / incremental label projection.\n`
    );
  });
}

import { Effect } from "effect";
import { OPENAPPA_SUPPORTED_SESSION_CALLS } from "./config.js";

/**
 * Per-root OpenAPPA call ordinal (tool_call count) for latency-vs-session-length
 * observability. ClawQL never rotates root_id to reset this — policy continuity
 * requires one trajectory per MCP session.
 */

const depthByRoot = new Map<string, number>();
/** Roots that already emitted a supported-limit / budget alert (once each). */
const alertedBudget = new Set<string>();
const alertedSupported = new Set<string>();

export function resetOpenAppaSessionDepthForTests(): void {
  depthByRoot.clear();
  alertedBudget.clear();
  alertedSupported.clear();
}

export function openAppaSessionDepthEffect(rootId: string): Effect.Effect<number> {
  return Effect.sync(() => depthByRoot.get(rootId) ?? 0);
}

/** Increment after a tool_call attempt (success or timeout); returns the new 1-based ordinal. */
export function openAppaRecordSessionCallEffect(rootId: string): Effect.Effect<number> {
  return Effect.sync(() => {
    const next = (depthByRoot.get(rootId) ?? 0) + 1;
    depthByRoot.set(rootId, next);
    return next;
  });
}

/**
 * Operator-visible alert when a long session crosses the documented supported
 * call count. Once per root.
 */
export function openAppaMaybeWarnSupportedLimitEffect(
  rootId: string,
  depth: number
): Effect.Effect<void> {
  return Effect.sync(() => {
    if (depth < OPENAPPA_SUPPORTED_SESSION_CALLS) return;
    if (alertedSupported.has(rootId)) return;
    alertedSupported.add(rootId);
    process.stderr.write(
      `[clawql-openappa] ALERT: session exceeded supported OpenAPPA call count ` +
        `(${OPENAPPA_SUPPORTED_SESSION_CALLS}) at call ${depth} ` +
        `(root=${rootId.slice(0, 64)}). Per-call policy latency grows with session length; ` +
        `expect fail-closed as CLAWQL_OPENAPPA_TIMEOUT_MS is approached. ` +
        `Do not rotate root_id. Fix: OpenAPPA incremental policy state / snapshots.\n`
    );
  });
}

/**
 * Warn when sidecar latency is elevated (trajectory growth). Throttled to
 * power-of-two depths so logs stay readable.
 */
export function openAppaMaybeWarnTrajectoryGrowthEffect(
  rootId: string,
  depth: number,
  elapsedMs: number,
  timeoutMs: number
): Effect.Effect<void> {
  return Effect.sync(() => {
    if (depth < 64) return;
    const warnAt = Math.max(40, timeoutMs * 0.25);
    if (elapsedMs < warnAt) return;
    const isPow2 = (depth & (depth - 1)) === 0;
    if (!isPow2) return;
    process.stderr.write(
      `[clawql-openappa] trajectory growth: root=${rootId.slice(0, 64)} depth=${depth} ` +
        `hook_ms=${elapsedMs.toFixed(1)} budget_ms=${timeoutMs} — ` +
        `per-call cost grows with session length; do not rotate root_id.\n`
    );
  });
}

/**
 * Clear, once-per-root alert when a hook hits the latency budget (timeout).
 * Message shape is intentional for operators and log scrapers.
 */
export function openAppaAlertLatencyBudgetExceededEffect(
  rootId: string,
  depth: number,
  timeoutMs: number
): Effect.Effect<string> {
  return Effect.sync(() => {
    const msg =
      `policy latency exceeded budget at call ${depth} ` +
      `(OpenAPPA /hook timed out after ${timeoutMs}ms; root=${rootId.slice(0, 64)})`;
    if (!alertedBudget.has(rootId)) {
      alertedBudget.add(rootId);
      process.stderr.write(`[clawql-openappa] ALERT: ${msg}\n`);
    }
    return msg;
  });
}

export function openAppaIsTimeoutErrorEffect(err: unknown): Effect.Effect<boolean> {
  return Effect.sync(() => {
    if (!err || typeof err !== "object") return false;
    const name = "name" in err ? String((err as { name?: unknown }).name) : "";
    const msg = err instanceof Error ? err.message : String(err);
    return name === "TimeoutError" || /timed out after \d+ms/i.test(msg) || /timeout/i.test(msg);
  });
}

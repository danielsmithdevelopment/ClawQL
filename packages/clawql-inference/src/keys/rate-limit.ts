import type { RateLimitSpec } from "./types.js";

const RPM_RE = /^(\d+)\s*rpm$/i;
const RPS_RE = /^(\d+)\s*rps$/i;

/** Parse `100rpm` or `10rps` into a rate limit spec. */
export function parseRateLimit(raw: string | undefined): RateLimitSpec | undefined {
  if (!raw?.trim()) return undefined;
  const rpm = RPM_RE.exec(raw.trim());
  if (rpm) {
    const maxRequests = Number.parseInt(rpm[1]!, 10);
    if (maxRequests > 0) return { maxRequests, windowMs: 60_000 };
  }
  const rps = RPS_RE.exec(raw.trim());
  if (rps) {
    const maxRequests = Number.parseInt(rps[1]!, 10);
    if (maxRequests > 0) return { maxRequests, windowMs: 1_000 };
  }
  return undefined;
}

type WindowState = {
  timestamps: number[];
};

const windows = new Map<string, WindowState>();

/** In-memory sliding-window rate limiter (per process). */
export function checkRateLimit(keyId: string, spec: RateLimitSpec, now = Date.now()): boolean {
  const state = windows.get(keyId) ?? { timestamps: [] };
  const cutoff = now - spec.windowMs;
  state.timestamps = state.timestamps.filter((t) => t > cutoff);
  if (state.timestamps.length >= spec.maxRequests) {
    windows.set(keyId, state);
    return false;
  }
  state.timestamps.push(now);
  windows.set(keyId, state);
  return true;
}

/** Test helper — reset in-memory rate limit state. */
export function resetRateLimitState(): void {
  windows.clear();
}

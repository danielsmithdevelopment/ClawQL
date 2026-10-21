import { Effect } from "effect";

/**
 * Fail-closed circuit breaker for OpenAPPA sidecar stalls.
 * After `failureThreshold` consecutive transport failures, open the circuit for
 * `cooldownMs` and fail immediately (no per-call wait). One probe after cooldown.
 */

export type CircuitState = "closed" | "open" | "half_open";

export type CircuitBreakerConfig = {
  readonly failureThreshold: number;
  readonly cooldownMs: number;
};

type CircuitSnapshot = {
  failures: number;
  openUntil: number;
  halfOpenProbeInFlight: boolean;
};

const circuits = new Map<string, CircuitSnapshot>();

function snap(key: string): CircuitSnapshot {
  let s = circuits.get(key);
  if (!s) {
    s = { failures: 0, openUntil: 0, halfOpenProbeInFlight: false };
    circuits.set(key, s);
  }
  return s;
}

export function resetOpenAppaCircuitBreakersForTests(): void {
  circuits.clear();
}

export function openAppaCircuitStateEffect(
  key: string,
  nowMs: number = Date.now()
): Effect.Effect<CircuitState> {
  return Effect.sync(() => {
    const s = snap(key);
    if (s.openUntil > nowMs) return "open";
    if (s.openUntil > 0 && s.openUntil <= nowMs) return "half_open";
    return "closed";
  });
}

/**
 * Before a call: if circuit is open, fail. If half-open, allow only one probe.
 * Returns null when the call may proceed; otherwise a fail-closed message.
 */
export function openAppaCircuitBeforeCallEffect(
  key: string,
  cfg: CircuitBreakerConfig,
  nowMs: number = Date.now()
): Effect.Effect<string | null> {
  return Effect.sync(() => {
    const s = snap(key);
    if (s.openUntil > nowMs) {
      const wait = Math.max(0, s.openUntil - nowMs);
      return `circuit open — failing closed for ${wait}ms cooldown (after ${cfg.failureThreshold} consecutive sidecar failures)`;
    }
    if (s.openUntil > 0 && s.openUntil <= nowMs) {
      // half-open: only one probe at a time
      if (s.halfOpenProbeInFlight) {
        return "circuit half-open — probe already in flight; failing closed";
      }
      s.halfOpenProbeInFlight = true;
      return null;
    }
    return null;
  });
}

export function openAppaCircuitRecordSuccessEffect(key: string): Effect.Effect<void> {
  return Effect.sync(() => {
    const s = snap(key);
    s.failures = 0;
    s.openUntil = 0;
    s.halfOpenProbeInFlight = false;
  });
}

export function openAppaCircuitRecordFailureEffect(
  key: string,
  cfg: CircuitBreakerConfig,
  nowMs: number = Date.now()
): Effect.Effect<{ readonly opened: boolean }> {
  return Effect.sync(() => {
    const s = snap(key);
    s.halfOpenProbeInFlight = false;
    s.failures += 1;
    if (s.failures >= cfg.failureThreshold) {
      s.openUntil = nowMs + cfg.cooldownMs;
      return { opened: true };
    }
    // half-open probe failed — reopen immediately
    if (s.openUntil > 0 && s.openUntil <= nowMs) {
      s.openUntil = nowMs + cfg.cooldownMs;
      return { opened: true };
    }
    return { opened: false };
  });
}

export function openAppaCircuitKey(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

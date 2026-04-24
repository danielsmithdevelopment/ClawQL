import type { EvolutionaryLoop } from "./evolutionary-loop.js";
import type { Seed } from "./seed.js";

export interface SeedPollerOptions {
  pollIntervalMs?: number;
  onError?: (seed: Seed, error: unknown) => void | Promise<void>;
}

function createSkipMutex() {
  let locked = false;
  return async function withLock<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (locked) return undefined;
    locked = true;
    try {
      return await fn();
    } finally {
      locked = false;
    }
  };
}

/**
 * Background poller for pending Seeds (caller supplies `fetchPending` / `markFailed`).
 * Returns `stop()` to clear the interval.
 */
export function startSeedsPoller(
  loop: EvolutionaryLoop,
  fetchPending: () => Promise<Seed[]>,
  markFailed: (seedId: string, error: unknown) => Promise<void>,
  options: SeedPollerOptions = {},
): { stop: () => void } {
  const { pollIntervalMs = 5_000, onError } = options;
  const withLock = createSkipMutex();

  const handle = setInterval(() => {
    void withLock(async () => {
      const pending = await fetchPending();
      for (const seed of pending) {
        try {
          await loop.run(seed);
        } catch (err) {
          await markFailed(seed.metadata.seed_id, err);
          await onError?.(seed, err);
        }
      }
    });
  }, pollIntervalMs);

  return { stop: () => clearInterval(handle) };
}

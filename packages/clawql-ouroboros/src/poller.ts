import type { EvolutionaryLoop } from "./evolutionary-loop.js";
import type { Seed } from "./seed.js";
import {
  startSeedsPollerCore,
  type SeedPollerOptions,
  type SeedRunFn,
} from "./glue/seeds-poller-core.js";

export type { SeedPollerOptions, SeedRunFn };

/**
 * Background poller for pending Seeds (caller supplies `fetchPending` / `markFailed`).
 * Returns `stop()` to clear the interval.
 */
export function startSeedsPoller(
  loop: EvolutionaryLoop,
  fetchPending: () => Promise<Seed[]>,
  markFailed: (seedId: string, error: unknown) => Promise<void>,
  options: SeedPollerOptions = {}
): { stop: () => void } {
  return startSeedsPollerCore(
    async (seed) => {
      await loop.run(seed);
    },
    fetchPending,
    markFailed,
    options
  );
}

/** Start poller using `OuroborosLoopService` via the default Effect runtime. */
export async function startSeedsPollerWithEffect(
  fetchPending: () => Promise<Seed[]>,
  markFailed: (seedId: string, error: unknown) => Promise<void>,
  options: SeedPollerOptions = {}
): Promise<{ stop: () => void }> {
  const { runOuroborosEffect } = await import("./effect/ouroboros-effect-runtime.js");
  const { startSeedsPollerViaServicesEffect } =
    await import("./effect/ouroboros-poller-service.js");
  return runOuroborosEffect(startSeedsPollerViaServicesEffect(fetchPending, markFailed, options));
}

import { Context, Effect, Layer } from "effect";
import type { Seed } from "../seed.js";
import { startSeedsPollerCore, type SeedPollerOptions } from "../glue/seeds-poller-core.js";
import { OuroborosLoopService } from "./ouroboros-loop-service.js";

/** Effect service for the Ouroboros seeds background poller. */
export class OuroborosPollerService extends Context.Tag("clawql/OuroborosPollerService")<
  OuroborosPollerService,
  {
    readonly start: (
      fetchPending: () => Promise<Seed[]>,
      markFailed: (seedId: string, error: unknown) => Promise<void>,
      options?: SeedPollerOptions
    ) => Effect.Effect<{ stop: () => void }, never, OuroborosLoopService>;
  }
>() {}

export function ouroborosPollerLiveLayer(): Layer.Layer<OuroborosPollerService> {
  return Layer.succeed(
    OuroborosPollerService,
    OuroborosPollerService.of({
      start: (fetchPending, markFailed, options) =>
        Effect.gen(function* () {
          const loopSvc = yield* OuroborosLoopService;
          return startSeedsPollerCore(
            async (seed) => {
              await Effect.runPromise(loopSvc.run(seed));
            },
            fetchPending,
            markFailed,
            options
          );
        }),
    })
  );
}

/** Start poller via default Ouroboros Effect services (no explicit loop instance). */
export function startSeedsPollerViaServicesEffect(
  fetchPending: () => Promise<Seed[]>,
  markFailed: (seedId: string, error: unknown) => Promise<void>,
  options?: SeedPollerOptions
): Effect.Effect<{ stop: () => void }, never, OuroborosPollerService | OuroborosLoopService> {
  return Effect.gen(function* () {
    const poller = yield* OuroborosPollerService;
    return yield* poller.start(fetchPending, markFailed, options);
  });
}

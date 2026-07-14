import { Deferred, Duration, Effect, Fiber, Ref, TestClock, TestContext } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startSeedsPoller } from "./poller.js";
import { startSeedsPollerFiberEffect, type SeedRunEffect } from "./glue/seeds-poller-core.js";
import type { Seed } from "./seed.js";

function makeSeed(seedId: string): Seed {
  return {
    goal: "poller test",
    task_type: "analysis",
    brownfield_context: {
      project_type: "greenfield",
      context_references: [],
      existing_patterns: [],
      existing_dependencies: [],
    },
    constraints: [],
    acceptance_criteria: [],
    ontology_schema: { name: "o", description: "d", fields: [] },
    evaluation_principles: [],
    exit_conditions: [],
    metadata: {
      seed_id: seedId,
      version: "1.0.0",
      created_at: new Date(),
      ambiguity_score: 0.1,
      interview_id: null,
      parent_seed_id: null,
    },
  };
}

describe("startSeedsPollerFiberEffect (TestClock)", () => {
  it("runs pending seeds and soft-fails failures", async () => {
    const okSeed = makeSeed("ok-seed");
    const badSeed = makeSeed("bad-seed");
    const runs: string[] = [];
    const failed: Array<{ id: string; err: unknown }> = [];
    const errors: Seed[] = [];

    const run: SeedRunEffect = (seed) =>
      Effect.gen(function* () {
        runs.push(seed.metadata.seed_id);
        if (seed.metadata.seed_id === "bad-seed") {
          yield* Effect.fail(new Error("boom"));
        }
      });

    await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* startSeedsPollerFiberEffect(
          run,
          Effect.succeed([okSeed, badSeed]),
          (seedId, error) =>
            Effect.sync(() => {
              failed.push({ id: seedId, err: error });
            }),
          {
            pollIntervalMs: 10,
            onError: async (seed) => {
              errors.push(seed);
            },
          }
        );
        yield* TestClock.adjust(Duration.millis(12));
        expect(runs).toEqual(["ok-seed", "bad-seed"]);
        expect(failed).toHaveLength(1);
        expect(failed[0]?.id).toBe("bad-seed");
        expect(errors).toHaveLength(1);
        yield* Fiber.interrupt(handle.fiber);
      }).pipe(Effect.provide(TestContext.TestContext))
    );
  });

  it("skips overlapping polls while prior run is in flight", async () => {
    const seed = makeSeed("slow-seed");
    const fetchCount = { n: 0 };

    await Effect.runPromise(
      Effect.gen(function* () {
        const latch = yield* Deferred.make<void>();
        const runCount = yield* Ref.make(0);

        const handle = yield* startSeedsPollerFiberEffect(
          () =>
            Effect.gen(function* () {
              yield* Ref.update(runCount, (n) => n + 1);
              yield* Deferred.await(latch);
            }),
          Effect.sync(() => {
            fetchCount.n += 1;
            return [seed];
          }),
          () => Effect.void,
          { pollIntervalMs: 10 }
        );

        yield* TestClock.adjust(Duration.millis(12));
        expect(fetchCount.n).toBe(1);
        expect(yield* Ref.get(runCount)).toBe(1);

        yield* TestClock.adjust(Duration.millis(30));
        expect(fetchCount.n).toBe(1);
        expect(yield* Ref.get(runCount)).toBe(1);

        yield* Deferred.succeed(latch, undefined);
        yield* TestClock.adjust(Duration.millis(12));
        expect(fetchCount.n).toBe(2);
        expect(yield* Ref.get(runCount)).toBe(2);

        yield* Fiber.interrupt(handle.fiber);
      }).pipe(Effect.provide(TestContext.TestContext))
    );
  });
});

describe("startSeedsPoller Promise façade", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes stop() without throwing", () => {
    const poller = startSeedsPoller(
      { run: async () => undefined } as never,
      async () => [],
      async () => {},
      { pollIntervalMs: 60_000 }
    );
    expect(typeof poller.stop).toBe("function");
    poller.stop();
  });
});

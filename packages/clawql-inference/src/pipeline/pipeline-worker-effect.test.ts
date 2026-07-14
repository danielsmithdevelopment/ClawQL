import { Duration, Effect, Fiber, TestClock, TestContext } from "effect";
import { describe, expect, it } from "vitest";
import { startPipelineWorkerFiberEffect } from "./pipeline-worker-effect.js";

describe("startPipelineWorkerFiberEffect", () => {
  it("runs an immediate first tick then spaced polls", async () => {
    const ticks = { n: 0 };
    await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* startPipelineWorkerFiberEffect(async () => {
          ticks.n += 1;
        }, 10);
        // first iteration runs tick before sleep
        yield* TestClock.adjust(Duration.millis(1));
        expect(ticks.n).toBeGreaterThanOrEqual(1);
        const afterFirst = ticks.n;
        yield* TestClock.adjust(Duration.millis(12));
        expect(ticks.n).toBeGreaterThan(afterFirst);
        yield* Fiber.interrupt(handle.fiber);
      }).pipe(Effect.provide(TestContext.TestContext))
    );
  });
});

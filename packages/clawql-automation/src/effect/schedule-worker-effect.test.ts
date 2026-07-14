import { Deferred, Duration, Effect, Fiber, Ref, TestClock, TestContext } from "effect";
import { describe, expect, it } from "vitest";
import { startScheduleWorkerFiberEffect } from "./schedule-worker-effect.js";

describe("startScheduleWorkerFiberEffect", () => {
  it("ticks after poll interval with TestClock", async () => {
    const ticks = { n: 0 };
    await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* startScheduleWorkerFiberEffect(async () => {
          ticks.n += 1;
          return 0;
        }, 10);
        yield* TestClock.adjust(Duration.millis(12));
        expect(ticks.n).toBe(1);
        yield* Fiber.interrupt(handle.fiber);
      }).pipe(Effect.provide(TestContext.TestContext))
    );
  });

  it("skips overlapping ticks while busy", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const started = yield* Ref.make(0);
        const latch = yield* Deferred.make<void>();

        const handle = yield* startScheduleWorkerFiberEffect(
          () =>
            Effect.runPromise(
              Effect.gen(function* () {
                yield* Ref.update(started, (n) => n + 1);
                yield* Deferred.await(latch);
                return 0;
              })
            ),
          10
        );

        yield* TestClock.adjust(Duration.millis(12));
        expect(yield* Ref.get(started)).toBe(1);

        yield* TestClock.adjust(Duration.millis(40));
        expect(yield* Ref.get(started)).toBe(1);

        yield* Deferred.succeed(latch, undefined);
        yield* TestClock.adjust(Duration.millis(12));
        expect(yield* Ref.get(started)).toBe(2);

        yield* Fiber.interrupt(handle.fiber);
      }).pipe(Effect.provide(TestContext.TestContext))
    );
  });

  it("reports tick errors via callback", async () => {
    const errors: string[] = [];
    await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* startScheduleWorkerFiberEffect(
          async () => {
            throw new Error("tick boom");
          },
          10,
          (msg) => errors.push(msg)
        );
        yield* TestClock.adjust(Duration.millis(12));
        expect(errors.some((e) => e.includes("tick boom"))).toBe(true);
        yield* Fiber.interrupt(handle.fiber);
      }).pipe(Effect.provide(TestContext.TestContext))
    );
  });
});

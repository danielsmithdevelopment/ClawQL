import { describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import {
  InMemoryHookRegistryLive,
  HookRegistry,
  WormAuditSink,
  type LifecycleHook,
} from "clawql-core";
import { fireSessionStartEffect, fireSessionEndEffect } from "./session-lifecycle.js";

describe("session lifecycle hooks", () => {
  it("fires session-start and session-end handlers", async () => {
    const seen: string[] = [];
    const startHook: LifecycleHook = {
      id: "test-session-start",
      scope: "session",
      event: "session-start",
      blocking: false,
      handler: () =>
        Effect.sync(() => {
          seen.push("start");
          return { allow: true };
        }),
    };
    const endHook: LifecycleHook = {
      id: "test-session-end",
      scope: "session",
      event: "session-end",
      blocking: false,
      handler: () =>
        Effect.sync(() => {
          seen.push("end");
          return { allow: true };
        }),
    };

    const worm = { append: () => Effect.void };

    await Effect.runPromise(
      Effect.gen(function* () {
        const reg = yield* HookRegistry;
        yield* reg.register("test", [startHook, endHook]);
        yield* fireSessionStartEffect({
          hookRegistry: reg,
          worm,
          sessionId: "s1",
        });
        yield* fireSessionEndEffect({
          hookRegistry: reg,
          worm,
          sessionId: "s1",
        });
      }).pipe(
        Effect.provide(Layer.mergeAll(InMemoryHookRegistryLive, Layer.succeed(WormAuditSink, worm)))
      )
    );

    expect(seen).toEqual(["start", "end"]);
  });
});

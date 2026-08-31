import { describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import {
  InMemoryHookRegistryLive,
  HookRegistry,
  WormAuditSink,
  type LifecycleHook,
} from "clawql-core";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { withModelLifecycleHooks } from "./hooked-gateway.js";

class StubGateway implements InferenceGateway {
  last?: InferenceRequest;
  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    this.last = request;
    return { content: "ok", model: "stub" };
  }
}

describe("withModelLifecycleHooks", () => {
  it("runs pre-model and post-model hooks around complete", async () => {
    const events: string[] = [];
    const pre: LifecycleHook = {
      id: "pre",
      scope: "model",
      event: "pre-model",
      blocking: true,
      handler: () =>
        Effect.sync(() => {
          events.push("pre");
          return { allow: true };
        }),
    };
    const post: LifecycleHook = {
      id: "post",
      scope: "model",
      event: "post-model",
      blocking: true,
      handler: () =>
        Effect.sync(() => {
          events.push("post");
          return { allow: true };
        }),
    };
    const worm = { append: () => Effect.void };

    const { gateway } = await Effect.runPromise(
      Effect.gen(function* () {
        const reg = yield* HookRegistry;
        yield* reg.register("m", [pre, post]);
        const inner = new StubGateway();
        const wrapped = withModelLifecycleHooks(inner, {
          hookRegistry: reg,
          worm,
          atrScopeTokens: [],
        });
        return { gateway: wrapped };
      }).pipe(
        Effect.provide(
          Layer.mergeAll(InMemoryHookRegistryLive, Layer.succeed(WormAuditSink, worm))
        )
      )
    );

    const res = await gateway.complete({
      messages: [{ role: "user", content: "hi" }],
      model: "stub",
    });
    expect(res.content).toBe("ok");
    expect(events).toEqual(["pre", "post"]);
  });
});

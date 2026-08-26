import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootProcessWormFromEnvEffect,
  resetProcessWormForTests,
} from "clawql-audit";
import { ConfiguredInferenceGateway } from "../gateway.js";
import { createOpenAiAdapter } from "../plugin/adapters/openai.js";
import { ObservedInferenceGateway } from "./observed-gateway.js";
import { InMemoryInferenceStore } from "../store/in-memory.js";

describe("ObservedInferenceGateway WORM dual-write", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_RECONCILE_MS;
    vi.unstubAllGlobals();
  });

  it("appends INFERENCE_CALL and INFERENCE_RESULT when WORM enabled", async () => {
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";

    const svc = await Effect.runPromise(bootProcessWormFromEnvEffect());
    expect(svc).not.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          model: "gpt-4o",
          choices: [{ message: { content: "logged" } }],
          usage: { prompt_tokens: 2, completion_tokens: 3 },
        }),
      }))
    );

    const inner = new ConfiguredInferenceGateway(
      new Map([
        ["openai", createOpenAiAdapter({ apiKey: "k", baseUrl: "https://api.openai.com/v1" })],
      ])
    );
    const store = new InMemoryInferenceStore();
    const gateway = new ObservedInferenceGateway(inner, store);
    await gateway.complete({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      correlationId: "inf_corr_1",
      virtualKeyId: "vk_test",
      routing: { tier: "standard", modelId: "openai/gpt-4o", retryAttempt: 0 },
    });

    const calls = await Effect.runPromise(svc!.query({ type: "INFERENCE_CALL" }));
    const results = await Effect.runPromise(svc!.query({ type: "INFERENCE_RESULT" }));
    expect(calls.some((e) => e.metadata?.correlationId === "inf_corr_1")).toBe(true);
    expect(calls.some((e) => e.virtualKeyId === "vk_test")).toBe(true);
    expect(results.some((e) => e.metadata?.ok === true)).toBe(true);
    expect(results.some((e) => e.metadata?.inputTokens === 2)).toBe(true);
  });
});

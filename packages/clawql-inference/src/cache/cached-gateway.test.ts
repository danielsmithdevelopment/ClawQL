import { describe, expect, it, vi } from "vitest";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { SemanticCachedGateway, withSemanticCache } from "./cached-gateway.js";
import { InMemorySemanticCacheStore } from "./in-memory.js";
import type { SemanticCacheConfig } from "./types.js";

class StubGateway implements InferenceGateway {
  calls = 0;
  constructor(private readonly content: string) {}

  async complete(_request: InferenceRequest): Promise<InferenceResponse> {
    this.calls += 1;
    return { content: this.content, model: "openai/gpt-4o" };
  }
}

const config: SemanticCacheConfig = {
  enabled: true,
  threshold: 0.99,
  ttlMs: 60_000,
  maxEntries: 100,
};

describe("SemanticCachedGateway", () => {
  it("returns cached response on similar embedding without calling provider", async () => {
    const inner = new StubGateway("live");
    const cache = new InMemorySemanticCacheStore(config);
    const embedder = {
      embed: vi
        .fn()
        .mockResolvedValueOnce(Float32Array.from([1, 0, 0]))
        .mockResolvedValueOnce(Float32Array.from([0.999, 0.001, 0])),
    };
    const gateway = new SemanticCachedGateway(inner, cache, config, embedder);
    const request = {
      model: "openai/gpt-4o",
      messages: [{ role: "user" as const, content: "status of cluster A" }],
    };

    const first = await gateway.complete(request);
    expect(first.content).toBe("live");
    expect(inner.calls).toBe(1);

    const second = await gateway.complete({
      ...request,
      messages: [{ role: "user", content: "cluster A status check" }],
    });
    expect(second.cacheHit).toBe(true);
    expect(second.content).toBe("live");
    expect(inner.calls).toBe(1);
  });

  it("is inactive when semantic cache env is off", async () => {
    const inner = new StubGateway("live");
    const gateway = withSemanticCache(inner, {
      config: { ...config, enabled: false },
      embedder: { embed: async () => Float32Array.from([1]) },
    });
    await gateway.complete({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });
    await gateway.complete({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hi again" }],
    });
    expect(inner.calls).toBe(2);
  });
});

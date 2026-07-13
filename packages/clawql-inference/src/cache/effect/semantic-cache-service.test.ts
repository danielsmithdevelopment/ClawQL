import { Cause, Effect, Layer } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../../gateway.js";
import { InferenceGatewayService } from "../../fallback/effect/inference-gateway-service.js";
import { InMemorySemanticCacheStore } from "../in-memory.js";
import type { SemanticCacheConfig } from "../types.js";
import { embedderLiveLayer } from "./embedder-service.js";
import { SemanticCacheService, semanticCacheLiveLayer } from "./semantic-cache-service.js";
import { semanticCacheStoreLiveLayer } from "./semantic-cache-store-service.js";

class StubGateway implements InferenceGateway {
  calls = 0;
  constructor(private readonly content: string) {}

  async complete(_request: InferenceRequest): Promise<InferenceResponse> {
    this.calls += 1;
    return { content: this.content, model: "openai/gpt-4o" };
  }
}

function stubGatewayLayer(inner: InferenceGateway) {
  return Layer.succeed(
    InferenceGatewayService,
    InferenceGatewayService.of({
      complete: (request) =>
        Effect.tryPromise({
          try: () => inner.complete(request),
          catch: (cause) => cause,
        }),
    })
  );
}

const config: SemanticCacheConfig = {
  enabled: true,
  threshold: 0.99,
  ttlMs: 60_000,
  maxEntries: 100,
};

describe("SemanticCacheService", () => {
  it("returns cached response on similar embedding without calling provider", async () => {
    const inner = new StubGateway("live");
    const cache = new InMemorySemanticCacheStore(config);
    const embedder = {
      embed: vi
        .fn()
        .mockResolvedValueOnce(Float32Array.from([1, 0, 0]))
        .mockResolvedValueOnce(Float32Array.from([0.999, 0.001, 0])),
    };

    const layer = semanticCacheLiveLayer(config).pipe(
      Layer.provide(
        Layer.mergeAll(
          stubGatewayLayer(inner),
          embedderLiveLayer(embedder),
          semanticCacheStoreLiveLayer(cache)
        )
      )
    );

    const request = {
      model: "openai/gpt-4o",
      messages: [{ role: "user" as const, content: "status of cluster A" }],
    };

    const first = await Effect.runPromise(
      Effect.gen(function* () {
        const semanticCache = yield* SemanticCacheService;
        return yield* semanticCache.completeWithCache(request);
      }).pipe(Effect.provide(layer))
    );
    expect(first.content).toBe("live");
    expect(inner.calls).toBe(1);

    const second = await Effect.runPromise(
      Effect.gen(function* () {
        const semanticCache = yield* SemanticCacheService;
        return yield* semanticCache.completeWithCache({
          ...request,
          messages: [{ role: "user", content: "cluster A status check" }],
        });
      }).pipe(Effect.provide(layer))
    );
    expect(second.cacheHit).toBe(true);
    expect(second.content).toBe("live");
    expect(inner.calls).toBe(1);
  });

  it("passes through when disabled", async () => {
    const inner = new StubGateway("ok");
    const cache = new InMemorySemanticCacheStore({ ...config, enabled: false });
    const embedder = { embed: vi.fn().mockResolvedValue(Float32Array.from([1])) };

    const layer = semanticCacheLiveLayer({ ...config, enabled: false }).pipe(
      Layer.provide(
        Layer.mergeAll(
          stubGatewayLayer(inner),
          embedderLiveLayer(embedder),
          semanticCacheStoreLiveLayer(cache)
        )
      )
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const semanticCache = yield* SemanticCacheService;
        return yield* semanticCache.completeWithCache({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "hi" }],
        });
      }).pipe(Effect.provide(layer))
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const semanticCache = yield* SemanticCacheService;
        return yield* semanticCache.completeWithCache({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "hi again" }],
        });
      }).pipe(Effect.provide(layer))
    );

    expect(inner.calls).toBe(2);
    expect(embedder.embed).not.toHaveBeenCalled();
  });

  it("falls back to gateway when embedding fails", async () => {
    const inner = new StubGateway("live");
    const cache = new InMemorySemanticCacheStore(config);
    const embedder = { embed: vi.fn().mockRejectedValue(new Error("embed down")) };

    const layer = semanticCacheLiveLayer(config).pipe(
      Layer.provide(
        Layer.mergeAll(
          stubGatewayLayer(inner),
          embedderLiveLayer(embedder),
          semanticCacheStoreLiveLayer(cache)
        )
      )
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const semanticCache = yield* SemanticCacheService;
        return yield* semanticCache.completeWithCache({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "hi" }],
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result.content).toBe("live");
    expect(inner.calls).toBe(1);
  });

  it("propagates gateway failures", async () => {
    const inner: InferenceGateway = {
      complete: async () => {
        throw new Error("provider down");
      },
    };
    const cache = new InMemorySemanticCacheStore(config);
    const embedder = { embed: vi.fn().mockResolvedValue(Float32Array.from([1, 0, 0])) };

    const layer = semanticCacheLiveLayer(config).pipe(
      Layer.provide(
        Layer.mergeAll(
          stubGatewayLayer(inner),
          embedderLiveLayer(embedder),
          semanticCacheStoreLiveLayer(cache)
        )
      )
    );

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const semanticCache = yield* SemanticCacheService;
        return yield* semanticCache.completeWithCache({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "hi" }],
        });
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const err = Cause.squash(exit.cause);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("provider down");
    }
  });
});

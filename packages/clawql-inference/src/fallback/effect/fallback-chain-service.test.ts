import { Cause, Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../../gateway.js";
import { FallbackExhaustedError } from "./fallback-errors.js";
import { FallbackChainService, fallbackChainLiveLayer } from "./fallback-chain-service.js";
import { InferenceGatewayService } from "./inference-gateway-service.js";

class StubGateway implements InferenceGateway {
  constructor(private readonly outcomes: Record<string, InferenceResponse | Error>) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    const model = request.model ?? "unknown";
    const outcome = this.outcomes[model];
    if (!outcome) throw new Error(`no stub for ${model}`);
    if (outcome instanceof Error) throw outcome;
    return outcome;
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

describe("FallbackChainService", () => {
  it("tries fallbacks in order after primary failure", async () => {
    const inner = new StubGateway({
      "openai/gpt-4o": new Error("rate limited"),
      "anthropic/claude-sonnet-4": { content: "backup", model: "anthropic/claude-sonnet-4" },
    });

    const layer = fallbackChainLiveLayer({
      enabled: true,
      chains: {
        byModel: {
          "openai/gpt-4o": ["openai/gpt-4o", "anthropic/claude-sonnet-4"],
        },
        byTier: {},
      },
    }).pipe(Layer.provide(stubGatewayLayer(inner)));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fallback = yield* FallbackChainService;
        return yield* fallback.completeWithFallback({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "hi" }],
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result.content).toBe("backup");
    expect(result.fallback?.succeeded).toBe("anthropic/claude-sonnet-4");
    expect(result.fallback?.attempted).toEqual(["openai/gpt-4o", "anthropic/claude-sonnet-4"]);
  });

  it("fails with FallbackExhaustedError when all models fail", async () => {
    const inner = new StubGateway({
      "openai/gpt-4o": new Error("rate limited"),
      "anthropic/claude-sonnet-4": new Error("also down"),
    });

    const layer = fallbackChainLiveLayer({
      enabled: true,
      chains: {
        byModel: {
          "openai/gpt-4o": ["openai/gpt-4o", "anthropic/claude-sonnet-4"],
        },
        byTier: {},
      },
    }).pipe(Layer.provide(stubGatewayLayer(inner)));

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const fallback = yield* FallbackChainService;
        return yield* fallback.completeWithFallback({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "hi" }],
        });
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const err = Cause.squash(exit.cause);
      expect(err).toBeInstanceOf(FallbackExhaustedError);
    }
  });

  it("passes through when disabled", async () => {
    const inner = new StubGateway({
      m: { content: "ok", model: "m" },
    });

    const layer = fallbackChainLiveLayer({
      enabled: false,
      chains: { byTier: {}, byModel: {} },
    }).pipe(Layer.provide(stubGatewayLayer(inner)));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fallback = yield* FallbackChainService;
        return yield* fallback.completeWithFallback({
          model: "m",
          messages: [{ role: "user", content: "x" }],
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result.content).toBe("ok");
  });
});

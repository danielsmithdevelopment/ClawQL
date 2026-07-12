import { describe, expect, it, vi } from "vitest";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { FallbackChainGateway } from "./fallback-gateway.js";

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

describe("FallbackChainGateway", () => {
  it("tries fallbacks in order after primary failure", async () => {
    const inner = new StubGateway({
      "openai/gpt-4o": new Error("rate limited"),
      "anthropic/claude-sonnet-4": { content: "backup", model: "anthropic/claude-sonnet-4" },
    });
    const gateway = new FallbackChainGateway(inner, {
      enabled: true,
      chains: {
        byModel: {
          "openai/gpt-4o": ["openai/gpt-4o", "anthropic/claude-sonnet-4"],
        },
        byTier: {},
      },
    });

    const result = await gateway.complete({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.content).toBe("backup");
    expect(result.fallback?.succeeded).toBe("anthropic/claude-sonnet-4");
    expect(result.fallback?.attempted).toEqual(["openai/gpt-4o", "anthropic/claude-sonnet-4"]);
  });

  it("passes through when disabled", async () => {
    const complete = vi.fn(async () => ({ content: "ok", model: "m" }));
    const gateway = new FallbackChainGateway({ complete } as InferenceGateway, {
      enabled: false,
      chains: { byTier: {}, byModel: {} },
    });
    await gateway.complete({ model: "m", messages: [{ role: "user", content: "x" }] });
    expect(complete).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from "vitest";
import { normalizeFallbackChain, resolveFallbackChain } from "./resolve.js";

describe("resolveFallbackChain", () => {
  const chains = {
    byTier: {
      frugal: ["ollama/phi4", "openai/gpt-4o-mini"],
      standard: ["groq/llama", "anthropic/claude-haiku-4"],
    },
    byModel: {
      "openai/gpt-4o": ["openai/gpt-4o", "anthropic/claude-sonnet-4"],
    },
  };

  it("uses model-specific chain when defined", () => {
    const chain = resolveFallbackChain(
      { model: "openai/gpt-4o", messages: [{ role: "user", content: "hi" }] },
      chains
    );
    expect(chain).toEqual(["openai/gpt-4o", "anthropic/claude-sonnet-4"]);
  });

  it("uses tier chain with primary first", () => {
    const chain = resolveFallbackChain(
      {
        model: "ollama/phi4",
        routing: { tier: "frugal", modelId: "ollama/phi4", retryAttempt: 0 },
        messages: [{ role: "user", content: "hi" }],
      },
      chains
    );
    expect(chain).toEqual(["ollama/phi4", "openai/gpt-4o-mini"]);
  });

  it("dedupes chain entries", () => {
    expect(normalizeFallbackChain("a", ["a", "b", "b"])).toEqual(["a", "b"]);
  });
});

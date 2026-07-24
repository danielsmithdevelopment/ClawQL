import { describe, expect, it } from "vitest";
import { parseModelId } from "./parse-model-id.js";

describe("parseModelId", () => {
  it("parses provider/model ids", () => {
    expect(parseModelId("anthropic/claude-sonnet-4")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4",
    });
  });

  it("defaults bare model ids to openai", () => {
    expect(parseModelId("gpt-4o")).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("keeps multi-segment OpenRouter model paths after the provider", () => {
    expect(parseModelId("openrouter/deepseek/deepseek-chat")).toEqual({
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
    });
    expect(parseModelId("openrouter/qwen/qwen3.6-plus")).toEqual({
      provider: "openrouter",
      model: "qwen/qwen3.6-plus",
    });
  });
});

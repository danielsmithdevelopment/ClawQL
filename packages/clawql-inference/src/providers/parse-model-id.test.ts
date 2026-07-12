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

  it("rejects empty provider or model", () => {
    expect(() => parseModelId("/model")).toThrow(/Invalid model id/);
    expect(() => parseModelId("openai/")).toThrow(/Invalid model id/);
  });
});

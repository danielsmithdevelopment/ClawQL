import { describe, expect, it } from "vitest";
import { resolveRequestModel, toPublicModelId } from "./model-resolve.js";
import { createProviderRegistry } from "../providers/registry.js";
import { composeDefaultProviderPlugins } from "../plugin/compose.js";

describe("resolveRequestModel", () => {
  const registry = createProviderRegistry({ plugins: composeDefaultProviderPlugins() });

  it("resolves bare OpenAI model ids", () => {
    const resolved = resolveRequestModel("gpt-4o", registry);
    expect(resolved?.gatewayModelId).toBe("openai/gpt-4o");
    expect(resolved?.publicModelId).toBe("gpt-4o");
  });

  it("resolves provider/model ids", () => {
    const resolved = resolveRequestModel("anthropic/claude-sonnet-4", registry);
    expect(resolved?.gatewayModelId).toBe("anthropic/claude-sonnet-4");
    expect(resolved?.publicModelId).toBe("claude-sonnet-4");
  });

  it("keeps ollama ids namespaced", () => {
    expect(toPublicModelId("ollama", "phi4")).toBe("ollama/phi4");
  });
});

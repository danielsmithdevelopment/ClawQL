import { describe, expect, it } from "vitest";
import { resolveRequestModel, toPublicModelId } from "./model-resolve.js";
import { createProviderRegistry } from "../providers/registry.js";
import { composeDefaultProviderPlugins } from "../plugin/compose.js";
import { DEFAULT_INFERENCE_MODEL_CATALOG } from "../catalog/index.js";

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

  it("resolves direct BYOK catalog models", () => {
    const resolved = resolveRequestModel("deepseek/deepseek-chat", registry);
    expect(resolved?.provider).toBe("deepseek");
    expect(resolved?.model).toBe("deepseek-chat");
    expect(resolved?.gatewayModelId).toBe("deepseek/deepseek-chat");
  });

  it("resolves catalog aliases to direct BYOK providers", () => {
    const resolved = resolveRequestModel("clawql/cheap-chat", registry);
    expect(resolved?.provider).toBe("deepseek");
    expect(resolved?.model).toBe("deepseek-chat");
    expect(resolved?.gatewayModelId).toBe("deepseek/deepseek-chat");
  });

  it("keeps OpenRouter escape-hatch ids on the openrouter provider", () => {
    const resolved = resolveRequestModel(
      "openrouter/deepseek/deepseek-chat",
      registry,
      DEFAULT_INFERENCE_MODEL_CATALOG
    );
    expect(resolved?.provider).toBe("openrouter");
    expect(resolved?.model).toBe("deepseek/deepseek-chat");
    expect(resolved?.gatewayModelId).toBe("openrouter/deepseek/deepseek-chat");
  });

  it("resolves Hermes/Cline Ornith ids onto the local MLX provider", () => {
    const viaAlias = resolveRequestModel("openai/ornith-1.5-35b-a3b", registry);
    expect(viaAlias?.provider).toBe("mlx");
    expect(viaAlias?.model).toBe("ornith-1.5-35b-a3b");
    expect(viaAlias?.gatewayModelId).toBe("mlx/ornith-1.5-35b-a3b");

    const bare = resolveRequestModel("ornith-1.5-35b-a3b", registry);
    expect(bare?.provider).toBe("mlx");
    expect(bare?.gatewayModelId).toBe("mlx/ornith-1.5-35b-a3b");

    const localPath = resolveRequestModel(
      "openai/ornith-1.5-35b-a3b",
      registry,
      DEFAULT_INFERENCE_MODEL_CATALOG,
      {
        mlxUpstreamModel: "/Users/danielsmith/models/ornith-1.5-35b-a3b",
      }
    );
    expect(localPath?.model).toBe("/Users/danielsmith/models/ornith-1.5-35b-a3b");
  });
});

import { describe, expect, it } from "vitest";
import { collectListedModels } from "./models.js";
import { createProviderRegistry } from "../providers/registry.js";
import { composeDefaultProviderPlugins } from "../plugin/compose.js";

describe("collectListedModels", () => {
  const registry = createProviderRegistry({ plugins: composeDefaultProviderPlugins() });

  it("lists direct BYOK catalog models when credentialed", async () => {
    const models = await collectListedModels(registry, {
      DEEPSEEK_API_KEY: "sk-test",
      CLAWQL_INFERENCE_LIST_UNCREDENTIALED: "0",
    });
    const ids = models.map((m) => m.id);
    expect(ids).toContain("deepseek/deepseek-chat");
    expect(ids).toContain("clawql/cheap-chat");
    expect(ids).not.toContain("openrouter/deepseek/deepseek-chat");
  });

  it("lists OpenRouter escape-hatch models only when keyed", async () => {
    const models = await collectListedModels(registry, {
      OPENROUTER_API_KEY: "sk-or-test",
    });
    const ids = models.map((m) => m.id);
    expect(ids).toContain("openrouter/deepseek/deepseek-chat");
  });
});

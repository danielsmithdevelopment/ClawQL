import { describe, expect, it } from "vitest";
import { composeProviderPlugins } from "../plugin/compose.js";
import { createProviderRegistry, registerProviderPlugins } from "./registry.js";
import type { InferenceProviderPlugin } from "./types.js";

function stubPlugin(id: string): InferenceProviderPlugin {
  return {
    id,
    version: "0.0.1",
    onRegister({ registry }) {
      registry.set(id, {
        provider: id,
        async complete() {
          return { content: id, model: `${id}/stub` };
        },
      });
    },
  };
}

describe("registerProviderPlugins", () => {
  it("composes built-in defaults automatically", () => {
    const registry = createProviderRegistry({ env: {} });
    expect(registry.has("openai")).toBe(true);
    expect(registry.has("anthropic")).toBe(true);
    expect(registry.has("ollama")).toBe(true);
    expect(registry.has("deepseek")).toBe(true);
    expect(registry.has("groq")).toBe(true);
    expect(registry.has("fireworks")).toBe(true);
    expect(registry.has("together")).toBe(true);
    expect(registry.has("mistral")).toBe(true);
    expect(registry.has("xai")).toBe(true);
    expect(registry.has("google")).toBe(true);
    // OpenRouter remains registered as an optional escape hatch
    expect(registry.has("openrouter")).toBe(true);
  });

  it("appends third-party extensions after builtins", () => {
    const registry = createProviderRegistry({
      env: {},
      plugins: composeProviderPlugins({ extensions: [stubPlugin("acme")] }),
    });
    expect(registry.has("acme")).toBe(true);
    expect(registry.has("openai")).toBe(true);
    expect(registry.has("deepseek")).toBe(true);
  });

  it("honors CLAWQL_INFERENCE_PROVIDERS allowlist", () => {
    const registry = createProviderRegistry({
      env: { CLAWQL_INFERENCE_PROVIDERS: "ollama" },
    });
    expect(registry.has("ollama")).toBe(true);
    expect(registry.has("openai")).toBe(false);
    expect(registry.has("anthropic")).toBe(false);
    expect(registry.has("deepseek")).toBe(false);
    expect(registry.has("openrouter")).toBe(false);
  });

  it("honors CLAWQL_INFERENCE_DISABLE_PROVIDERS denylist", () => {
    const registry = createProviderRegistry({
      env: { CLAWQL_INFERENCE_DISABLE_PROVIDERS: "ollama,openrouter" },
    });
    expect(registry.has("ollama")).toBe(false);
    expect(registry.has("openrouter")).toBe(false);
    expect(registry.has("openai")).toBe(true);
    expect(registry.has("deepseek")).toBe(true);
  });

  it("supports integrator-only plugin lists", () => {
    const registry = registerProviderPlugins([stubPlugin("custom")], {
      env: {},
      allowlist: ["custom"],
    });
    expect(registry.has("custom")).toBe(true);
    expect(registry.size).toBe(1);
  });
});

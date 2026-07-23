import { describe, expect, it } from "vitest";
import {
  DEFAULT_INFERENCE_MODEL_CATALOG,
  findCatalogModel,
  providerCredentialPresent,
  resolveCatalogAlias,
} from "./index.js";

describe("inference model catalog", () => {
  it("ships BYOK models and clawql aliases", () => {
    expect(DEFAULT_INFERENCE_MODEL_CATALOG.version).toBe(1);
    expect(DEFAULT_INFERENCE_MODEL_CATALOG.aliases["clawql/cheap-chat"]).toBe(
      "deepseek/deepseek-chat"
    );
    expect(findCatalogModel("deepseek/deepseek-chat", DEFAULT_INFERENCE_MODEL_CATALOG)?.provider).toBe(
      "deepseek"
    );
  });

  it("resolves aliases before lookup", () => {
    expect(resolveCatalogAlias("clawql/fast-chat", DEFAULT_INFERENCE_MODEL_CATALOG)).toBe(
      "groq/llama-3.3-70b-versatile"
    );
  });

  it("treats OpenRouter entries as optional escape hatch", () => {
    const entry = findCatalogModel(
      "openrouter/deepseek/deepseek-chat",
      DEFAULT_INFERENCE_MODEL_CATALOG
    );
    expect(entry?.provider).toBe("openrouter");
    expect(entry?.tags).toContain("openrouter-escape-hatch");
  });

  it("detects provider credentials from env", () => {
    expect(providerCredentialPresent("deepseek", {})).toBe(false);
    expect(providerCredentialPresent("deepseek", { DEEPSEEK_API_KEY: "sk-test" })).toBe(true);
    expect(providerCredentialPresent("ollama", {})).toBe(true);
    expect(providerCredentialPresent("openrouter", { OPENROUTER_API_KEY: "sk-or" })).toBe(true);
  });
});

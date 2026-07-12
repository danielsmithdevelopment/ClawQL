import { describe, expect, it } from "vitest";
import { loadPalRoutingConfig, createAdaptiveRouter } from "./config.js";
import { PalAdaptiveRouter } from "./pal-router.js";

describe("loadPalRoutingConfig", () => {
  it("disables routing by default", () => {
    const cfg = loadPalRoutingConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.modelPin).toBeUndefined();
  });

  it("enables routing when CLAWQL_INFERENCE_ROUTING_ENABLED=1", () => {
    const cfg = loadPalRoutingConfig({ CLAWQL_INFERENCE_ROUTING_ENABLED: "1" });
    expect(cfg.enabled).toBe(true);
    expect(cfg.tierMap.standard).toBe("groq/llama-3.3-70b");
  });

  it("enables routing when model pin is set", () => {
    const cfg = loadPalRoutingConfig({ CLAWQL_INFERENCE_MODEL_PIN: "openai/gpt-4o" });
    expect(cfg.enabled).toBe(true);
    expect(cfg.modelPin).toBe("openai/gpt-4o");
  });

  it("reads custom tier map from env", () => {
    const cfg = loadPalRoutingConfig({
      CLAWQL_INFERENCE_ROUTING_ENABLED: "true",
      CLAWQL_INFERENCE_MODEL_FRUGAL: "local/phi",
      CLAWQL_INFERENCE_MODEL_STANDARD: "groq/qwen",
      CLAWQL_INFERENCE_MODEL_FRONTIER: "anthropic/opus",
    });
    expect(cfg.tierMap).toEqual({
      frugal: "local/phi",
      standard: "groq/qwen",
      frontier: "anthropic/opus",
    });
  });
});

describe("createAdaptiveRouter", () => {
  it("returns undefined when routing is disabled", () => {
    expect(createAdaptiveRouter(loadPalRoutingConfig({}))).toBeUndefined();
  });

  it("returns router when enabled", () => {
    const router = createAdaptiveRouter(
      loadPalRoutingConfig({ CLAWQL_INFERENCE_ROUTING_ENABLED: "1" }),
    );
    expect(router).toBeInstanceOf(PalAdaptiveRouter);
  });
});

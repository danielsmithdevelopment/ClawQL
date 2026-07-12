import { describe, expect, it } from "vitest";
import { loadModelEscalationConfig, createModelEscalationRouter } from "./config.js";
import { TierEscalationRouter } from "./tier-escalation-router.js";

describe("loadModelEscalationConfig", () => {
  it("disables model escalation by default", () => {
    const cfg = loadModelEscalationConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.modelPin).toBeUndefined();
  });

  it("enables escalation when CLAWQL_INFERENCE_ROUTING_ENABLED=1", () => {
    const cfg = loadModelEscalationConfig({ CLAWQL_INFERENCE_ROUTING_ENABLED: "1" });
    expect(cfg.enabled).toBe(true);
    expect(cfg.tierMap.standard).toBe("groq/llama-3.3-70b");
  });

  it("enables escalation when model pin is set", () => {
    const cfg = loadModelEscalationConfig({ CLAWQL_INFERENCE_MODEL_PIN: "openai/gpt-4o" });
    expect(cfg.enabled).toBe(true);
    expect(cfg.modelPin).toBe("openai/gpt-4o");
  });

  it("reads custom tier map from env", () => {
    const cfg = loadModelEscalationConfig({
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

describe("createModelEscalationRouter", () => {
  it("returns undefined when escalation is disabled", () => {
    expect(createModelEscalationRouter(loadModelEscalationConfig({}))).toBeUndefined();
  });

  it("returns router when enabled", () => {
    const router = createModelEscalationRouter(
      loadModelEscalationConfig({ CLAWQL_INFERENCE_ROUTING_ENABLED: "1" })
    );
    expect(router).toBeInstanceOf(TierEscalationRouter);
  });
});

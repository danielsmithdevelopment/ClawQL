import { describe, expect, it } from "vitest";
import {
  assertInferenceModelAllowed,
  inferenceLocalOnlyEnabled,
  isLocalInferenceModelId,
} from "./local-only.js";

describe("inference local-only (X4)", () => {
  it("treats only ollama/mlx/local as local providers", () => {
    expect(isLocalInferenceModelId("ollama/phi4")).toBe(true);
    expect(isLocalInferenceModelId("mlx/llama")).toBe(true);
    expect(isLocalInferenceModelId("local/tiny")).toBe(true);
    expect(isLocalInferenceModelId("clawql")).toBe(false);
    expect(isLocalInferenceModelId("clawql-auto")).toBe(false);
    expect(isLocalInferenceModelId("openai/gpt-4o")).toBe(false);
    expect(isLocalInferenceModelId("anthropic/claude-sonnet-4")).toBe(false);
  });

  it("refuses cloud models when LOCAL_ONLY=1", () => {
    const env = { CLAWQL_INFERENCE_LOCAL_ONLY: "1" };
    expect(inferenceLocalOnlyEnabled(env)).toBe(true);
    expect(() => assertInferenceModelAllowed("openai/gpt-4o", env)).toThrow(/local-only/);
    expect(() => assertInferenceModelAllowed("ollama/phi4", env)).not.toThrow();
  });

  it("allowlists explicit models", () => {
    const env = {
      CLAWQL_INFERENCE_LOCAL_ONLY: "1",
      CLAWQL_INFERENCE_LOCAL_ALLOWLIST: "anthropic/claude-sonnet-4",
    };
    expect(() =>
      assertInferenceModelAllowed("anthropic/claude-sonnet-4", env)
    ).not.toThrow();
  });
});

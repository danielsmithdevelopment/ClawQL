import { describe, expect, it } from "vitest";
import { applyTerseOutput } from "./layer-3-terse.js";
import { applyPromptCacheMarkers } from "./layer-4-prompt-cache.js";
import {
  extractResourceTags,
  resolveCacheIntent,
  shouldInvalidateEntry,
} from "./layer-5-policy.js";
import { compressHistory } from "./layer-6-history.js";
import { compressPrompt } from "./layer-7-prompt.js";
import { isAutoRouteModel, resolveHttpRoutingDecision } from "./layer-8-routing.js";
import { applyExtensionLayers } from "./layer-9-11-extensions.js";
import { loadTokenEfficiencyConfig } from "./config.js";

describe("token efficiency layers", () => {
  it("layer 3 strips hedging but preserves code blocks", () => {
    const input =
      "I'd be happy to help!\n\n```ts\nconst x = 1;\n```\n\nBased on my analysis, update config.";
    const out = applyTerseOutput(input);
    expect(out).toContain("```ts");
    expect(out).toContain("const x = 1;");
    expect(out).not.toMatch(/happy to help/i);
  });

  it("layer 4 merges system messages for prompt cache", () => {
    const { messages, hints } = applyPromptCacheMarkers([
      { role: "system", content: "A" },
      { role: "system", content: "B" },
      { role: "user", content: "hi" },
    ]);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("A");
    expect(hints.anthropicCacheSystem).toBe(true);
  });

  it("layer 5 infers write intent and invalidates by tags", () => {
    expect(
      resolveCacheIntent({
        messages: [{ content: "Please delete issue id: CLAW-42" }],
      })
    ).toBe("write");
    const tags = extractResourceTags([{ content: "update ticket id: ENG-9" }]);
    expect(tags.length).toBeGreaterThan(0);
    expect(shouldInvalidateEntry(tags, tags)).toBe(true);
  });

  it("layer 6 compresses long history", () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message-${i}-${"x".repeat(5000)}`,
    }));
    const out = compressHistory(messages, { maxChars: 20_000, keepRecentMessages: 4 });
    expect(out.some((message) => message.content.includes("Distilled session context"))).toBe(true);
    expect(out.length).toBeLessThan(messages.length);
  });

  it("layer 7 dedupes system and truncates long messages", () => {
    const out = compressPrompt(
      [
        { role: "system", content: "same" },
        { role: "system", content: "same" },
        { role: "user", content: "y".repeat(20_000) },
      ],
      { maxMessageChars: 100 }
    );
    expect(out.filter((message) => message.role === "system")).toHaveLength(1);
    expect(out[1]?.content).toContain("truncated");
  });

  it("layer 8 resolves auto-route models", () => {
    expect(isAutoRouteModel("clawql/auto")).toBe(true);
    const config = loadTokenEfficiencyConfig({
      CLAWQL_INFERENCE_ROUTING_ENABLED: "1",
      CLAWQL_INFERENCE_HTTP_AUTO_ROUTE: "1",
      CLAWQL_INFERENCE_MODEL_FRUGAL: "ollama/phi4",
    });
    const decision = resolveHttpRoutingDecision({
      model: "clawql/auto",
      config,
    });
    expect(decision?.modelId).toBe("ollama/phi4");
  });

  it("layers 9-11 inject budget and structured hints", () => {
    const { messages, hints } = applyExtensionLayers({
      messages: [{ role: "user", content: "summarize" }],
      maxTokens: 200,
      structuredOutputEnabled: true,
      tokenBudgetEnabled: true,
      prefillEnabled: false,
      prefillOpener: "",
    });
    expect(hints.tokenBudgetHint).toContain("200");
    expect(messages.some((message) => message.content.includes("structured output"))).toBe(true);
  });
});

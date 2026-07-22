import { describe, expect, it } from "vitest";
import { parseHarnessUsage } from "./harness-cli.js";

describe("parseHarnessUsage", () => {
  it("parses Claude Code JSON usage", () => {
    const stdout = JSON.stringify({
      num_turns: 4,
      is_error: false,
      result: "done",
      usage: { input_tokens: 100, output_tokens: 20 },
      modelUsage: {
        "claude-opus-4-8": {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    const usage = parseHarnessUsage("claude", stdout);
    expect(usage.turns).toBe(4);
    expect(usage.tokensInputUncached).toBe(100);
    expect(usage.tokensOutput).toBe(20);
    expect(usage.tokens).toBe(120);
    expect(usage.tokenBasis).toBe("vendor_split");
  });

  it("parses Codex JSONL turn.completed usage", () => {
    const stdout = [
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 50, output_tokens: 10 } }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 80, output_tokens: 15 } }),
    ].join("\n");
    const usage = parseHarnessUsage("codex", stdout);
    expect(usage.tokensInputUncached).toBe(80);
    expect(usage.tokensOutput).toBe(15);
    expect(usage.tokens).toBe(95);
  });

  it("returns empty usage for noise", () => {
    const usage = parseHarnessUsage("claude", "not json at all");
    expect(usage.tokens).toBeNull();
    expect(usage.turns).toBeNull();
  });
});

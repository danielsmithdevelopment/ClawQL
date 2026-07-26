import { describe, expect, it } from "vitest";
import {
  buildOpencodeConfigContent,
  clawqlMcpChildEnv,
  parseHarnessUsage,
} from "./harness-cli.js";

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

describe("buildOpencodeConfigContent", () => {
  it("embeds MCP + provider so OPENCODE_CONFIG_CONTENT does not drop memory tools", () => {
    const prevHome = process.env.CLAWQL_HOME;
    const prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    process.env.CLAWQL_HOME = "/tmp/clawql-ab-vault";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = "/tmp/clawql-ab-vault";
    process.env.CLAWQL_ENABLE_MEMORY = "1";
    try {
      const raw = buildOpencodeConfigContent({
        inferenceUrl: "http://127.0.0.1:8080/v1",
        gatewayModel: "openrouter/google/gemini-2.5-flash-lite",
        home: "/tmp/clawql-ab-vault",
      });
      const cfg = JSON.parse(raw) as {
        provider: { clawql: { options: { baseURL: string }; models: Record<string, unknown> } };
        mcp: { clawql: { enabled: boolean; environment: Record<string, string>; command: string[] } };
      };
      expect(cfg.provider.clawql.options.baseURL).toBe("http://127.0.0.1:8080/v1");
      expect(cfg.provider.clawql.models["openrouter/google/gemini-2.5-flash-lite"]).toEqual({});
      expect(cfg.mcp.clawql.enabled).toBe(true);
      expect(cfg.mcp.clawql.environment.CLAWQL_OBSIDIAN_VAULT_PATH).toBe("/tmp/clawql-ab-vault");
      expect(cfg.mcp.clawql.environment.CLAWQL_ENABLE_MEMORY).toBe("1");
      expect(cfg.mcp.clawql.command.length).toBeGreaterThan(0);
    } finally {
      if (prevHome === undefined) delete process.env.CLAWQL_HOME;
      else process.env.CLAWQL_HOME = prevHome;
      if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    }
  });

  it("clawqlMcpChildEnv prefers CLAWQL_OBSIDIAN_VAULT_PATH", () => {
    const prev = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = "/tmp/seeded-vault";
    try {
      const env = clawqlMcpChildEnv("/tmp/other-home");
      expect(env.CLAWQL_OBSIDIAN_VAULT_PATH).toBe("/tmp/seeded-vault");
      expect(env.CLAWQL_HOME).toBe("/tmp/other-home");
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prev;
    }
  });
});

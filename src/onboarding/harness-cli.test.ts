import { describe, expect, it } from "vitest";
import {
  buildOpencodeConfigContent,
  clawqlMcpChildEnv,
  openbenchOpencodePermissions,
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
        permission?: Record<string, string>;
        provider: { clawql: { options: { baseURL: string }; models: Record<string, unknown> } };
        mcp: {
          clawql: { enabled: boolean; environment: Record<string, string>; command: string[] };
        };
      };
      expect(cfg.permission).toEqual({
        "*": "allow",
        question: "deny",
        external_directory: "allow",
        doom_loop: "deny",
      });
      expect(cfg.provider.clawql.options.baseURL).toBe("http://127.0.0.1:8080/v1");
      expect(cfg.provider.clawql.models["openrouter/google/gemini-2.5-flash-lite"]).toEqual({
        limit: { context: 32000, output: 2048 },
      });
      expect(cfg.mcp.clawql.enabled).toBe(true);
      expect(cfg.mcp.clawql.environment.CLAWQL_OBSIDIAN_VAULT_PATH).toBe("/tmp/clawql-ab-vault");
      expect(cfg.mcp.clawql.environment.CLAWQL_ENABLE_MEMORY).toBe("1");
      expect(cfg.mcp.clawql.environment.CLAWQL_ENABLE_PAGEINDEX).toBe("0");
      expect(cfg.mcp.clawql.environment.CLAWQL_ENABLE_DOCUMENTS).toBe("0");
      expect(cfg.mcp.clawql.environment.CLAWQL_MEMORY_RECALL_SNIPPET_CHARS).toBe("8192");
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

  it("clawqlMcpChildEnv forwards Ouroboros enablement and generation cap", () => {
    const prevEn = process.env.CLAWQL_ENABLE_OUROBOROS;
    const prevCap = process.env.CLAWQL_OUROBOROS_MAX_GENERATIONS;
    process.env.CLAWQL_ENABLE_OUROBOROS = "1";
    process.env.CLAWQL_OUROBOROS_MAX_GENERATIONS = "4";
    try {
      const env = clawqlMcpChildEnv("/tmp/ouro-home");
      expect(env.CLAWQL_ENABLE_OUROBOROS).toBe("1");
      expect(env.CLAWQL_OUROBOROS_MAX_GENERATIONS).toBe("4");
    } finally {
      if (prevEn === undefined) delete process.env.CLAWQL_ENABLE_OUROBOROS;
      else process.env.CLAWQL_ENABLE_OUROBOROS = prevEn;
      if (prevCap === undefined) delete process.env.CLAWQL_OUROBOROS_MAX_GENERATIONS;
      else process.env.CLAWQL_OUROBOROS_MAX_GENERATIONS = prevCap;
    }
  });

  it("clawqlMcpChildEnv forwards provider pin and Panguard deny list", () => {
    const prevProv = process.env.CLAWQL_PROVIDER;
    const prevIn = process.env.CLAWQL_PANGUARD_IN_PROCESS;
    const prevBlock = process.env.CLAWQL_PANGUARD_BLOCK_TOOLS;
    process.env.CLAWQL_PROVIDER = "github";
    process.env.CLAWQL_PANGUARD_IN_PROCESS = "1";
    process.env.CLAWQL_PANGUARD_BLOCK_TOOLS = "execute";
    try {
      const env = clawqlMcpChildEnv("/tmp/policy-home");
      expect(env.CLAWQL_PROVIDER).toBe("github");
      expect(env.CLAWQL_PANGUARD_IN_PROCESS).toBe("1");
      expect(env.CLAWQL_PANGUARD_BLOCK_TOOLS).toBe("execute");
    } finally {
      if (prevProv === undefined) delete process.env.CLAWQL_PROVIDER;
      else process.env.CLAWQL_PROVIDER = prevProv;
      if (prevIn === undefined) delete process.env.CLAWQL_PANGUARD_IN_PROCESS;
      else process.env.CLAWQL_PANGUARD_IN_PROCESS = prevIn;
      if (prevBlock === undefined) delete process.env.CLAWQL_PANGUARD_BLOCK_TOOLS;
      else process.env.CLAWQL_PANGUARD_BLOCK_TOOLS = prevBlock;
    }
  });

  it("clawqlMcpChildEnv forwards CLAWQL_ENABLE_PAGEINDEX=1 override", () => {
    const prevOb = process.env.CLAWQL_OPENBENCH;
    const prevPi = process.env.CLAWQL_ENABLE_PAGEINDEX;
    process.env.CLAWQL_OPENBENCH = "1";
    process.env.CLAWQL_ENABLE_PAGEINDEX = "1";
    try {
      const env = clawqlMcpChildEnv("/tmp/pi-home");
      expect(env.CLAWQL_ENABLE_PAGEINDEX).toBe("1");
    } finally {
      if (prevOb === undefined) delete process.env.CLAWQL_OPENBENCH;
      else process.env.CLAWQL_OPENBENCH = prevOb;
      if (prevPi === undefined) delete process.env.CLAWQL_ENABLE_PAGEINDEX;
      else process.env.CLAWQL_ENABLE_PAGEINDEX = prevPi;
    }
  });

  it("clawqlMcpChildEnv forwards CLAWQL_EXTERNAL_INGEST + DOCUMENTS for OpenBench", () => {
    const prevOb = process.env.CLAWQL_OPENBENCH;
    const prevDoc = process.env.CLAWQL_ENABLE_DOCUMENTS;
    const prevExt = process.env.CLAWQL_EXTERNAL_INGEST;
    process.env.CLAWQL_OPENBENCH = "1";
    process.env.CLAWQL_ENABLE_DOCUMENTS = "1";
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    try {
      const env = clawqlMcpChildEnv("/tmp/ext-home");
      expect(env.CLAWQL_ENABLE_DOCUMENTS).toBe("1");
      expect(env.CLAWQL_EXTERNAL_INGEST).toBe("1");
    } finally {
      if (prevOb === undefined) delete process.env.CLAWQL_OPENBENCH;
      else process.env.CLAWQL_OPENBENCH = prevOb;
      if (prevDoc === undefined) delete process.env.CLAWQL_ENABLE_DOCUMENTS;
      else process.env.CLAWQL_ENABLE_DOCUMENTS = prevDoc;
      if (prevExt === undefined) delete process.env.CLAWQL_EXTERNAL_INGEST;
      else process.env.CLAWQL_EXTERNAL_INGEST = prevExt;
    }
  });

  it("clawqlMcpChildEnv forwards notify + Slack stub + SPEC_PATH for OpenBench", () => {
    const keys = [
      "CLAWQL_OPENBENCH",
      "CLAWQL_ENABLE_NOTIFY",
      "CLAWQL_SLACK_TOKEN",
      "CLAWQL_TEST_SLACK_FETCH_STUB",
      "CLAWQL_TEST_SLACK_FETCH_BODY",
      "CLAWQL_SPEC_PATH",
      "CLAWQL_PROVIDER",
    ] as const;
    const prev: Record<string, string | undefined> = {};
    for (const k of keys) prev[k] = process.env[k];
    process.env.CLAWQL_OPENBENCH = "1";
    process.env.CLAWQL_ENABLE_NOTIFY = "1";
    process.env.CLAWQL_SLACK_TOKEN = "xoxb-test";
    process.env.CLAWQL_TEST_SLACK_FETCH_STUB = "1";
    process.env.CLAWQL_TEST_SLACK_FETCH_BODY = '{"ok":true}';
    process.env.CLAWQL_SPEC_PATH = "/tmp/minimal-slack.json";
    process.env.CLAWQL_PROVIDER = "slack";
    try {
      const env = clawqlMcpChildEnv("/tmp/notify-home");
      expect(env.CLAWQL_ENABLE_NOTIFY).toBe("1");
      expect(env.CLAWQL_SLACK_TOKEN).toBe("xoxb-test");
      expect(env.CLAWQL_TEST_SLACK_FETCH_STUB).toBe("1");
      expect(env.CLAWQL_TEST_SLACK_FETCH_BODY).toBe('{"ok":true}');
      expect(env.CLAWQL_SPEC_PATH).toBe("/tmp/minimal-slack.json");
      expect(env.CLAWQL_PROVIDER).toBe("slack");
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });

  it("clawqlMcpChildEnv forwards sandbox enablement + docker image for OpenBench", () => {
    const keys = [
      "CLAWQL_OPENBENCH",
      "CLAWQL_ENABLE_SANDBOX",
      "CLAWQL_SANDBOX_BACKEND",
      "CLAWQL_SANDBOX_DOCKER_IMAGE_PYTHON",
    ] as const;
    const prev: Record<string, string | undefined> = {};
    for (const k of keys) prev[k] = process.env[k];
    process.env.CLAWQL_OPENBENCH = "1";
    process.env.CLAWQL_ENABLE_SANDBOX = "1";
    process.env.CLAWQL_SANDBOX_BACKEND = "docker";
    process.env.CLAWQL_SANDBOX_DOCKER_IMAGE_PYTHON = "python:3.12-alpine";
    try {
      const env = clawqlMcpChildEnv("/tmp/sbx-home");
      expect(env.CLAWQL_ENABLE_SANDBOX).toBe("1");
      expect(env.CLAWQL_SANDBOX_BACKEND).toBe("docker");
      expect(env.CLAWQL_SANDBOX_DOCKER_IMAGE_PYTHON).toBe("python:3.12-alpine");
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });

  it("clawqlMcpChildEnv forwards Onyx enablement + fetch stub for OpenBench", () => {
    const keys = [
      "CLAWQL_OPENBENCH",
      "CLAWQL_ENABLE_ONYX",
      "CLAWQL_ENABLE_DOCUMENTS",
      "ONYX_BASE_URL",
      "ONYX_API_TOKEN",
      "CLAWQL_TEST_ONYX_FETCH_STUB",
      "CLAWQL_TEST_ONYX_FETCH_BODY",
    ] as const;
    const prev: Record<string, string | undefined> = {};
    for (const k of keys) prev[k] = process.env[k];
    process.env.CLAWQL_OPENBENCH = "1";
    process.env.CLAWQL_ENABLE_ONYX = "1";
    process.env.CLAWQL_ENABLE_DOCUMENTS = "1";
    process.env.ONYX_BASE_URL = "http://127.0.0.1:9";
    process.env.ONYX_API_TOKEN = "tok";
    process.env.CLAWQL_TEST_ONYX_FETCH_STUB = "1";
    process.env.CLAWQL_TEST_ONYX_FETCH_BODY = '{"documents":[]}';
    try {
      const env = clawqlMcpChildEnv("/tmp/onyx-home");
      expect(env.CLAWQL_ENABLE_ONYX).toBe("1");
      expect(env.CLAWQL_ENABLE_DOCUMENTS).toBe("1");
      expect(env.ONYX_BASE_URL).toBe("http://127.0.0.1:9");
      expect(env.ONYX_API_TOKEN).toBe("tok");
      expect(env.CLAWQL_TEST_ONYX_FETCH_STUB).toBe("1");
      expect(env.CLAWQL_TEST_ONYX_FETCH_BODY).toBe('{"documents":[]}');
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });

  it("openbenchOpencodePermissions can allow doom_loop for thrash experiments", () => {
    const prev = process.env.CLAWQL_OPENBENCH_DOOM_LOOP;
    try {
      delete process.env.CLAWQL_OPENBENCH_DOOM_LOOP;
      expect(openbenchOpencodePermissions()).toEqual({
        "*": "allow",
        question: "deny",
        external_directory: "allow",
        doom_loop: "deny",
      });
      process.env.CLAWQL_OPENBENCH_DOOM_LOOP = "allow";
      expect(openbenchOpencodePermissions()).toEqual({
        "*": "allow",
        question: "deny",
        external_directory: "allow",
      });
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_OPENBENCH_DOOM_LOOP;
      else process.env.CLAWQL_OPENBENCH_DOOM_LOOP = prev;
    }
  });
});

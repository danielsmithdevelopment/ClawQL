import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installPersonalAgentHooks, planPersonalAgentInstall } from "./personal/install.js";
import { planOpenClawLiveWiring } from "./adapters/openclaw/live-mcp.js";
import { OPENCLAW_ATR_TEMPLATES } from "./adapters/openclaw/atr-templates.js";
import {
  createMemoryOAuthPersistence,
  createMemorySecretSource,
  createOAuthTokenStore,
  createOutboundAPIKeyManager,
  ReauthRequiredError,
} from "clawql-auth";
import { getOutboundCredential } from "./auth/outbound-credential.js";
import { catalogAgentsForBench, runAgentBenchmarkDry } from "./bench/dry-runner.js";
import { CLINE_ATR_TEMPLATES } from "./adapters/cline/atr-templates.js";

describe("personal agent install plan", () => {
  it("plans Hermes + Cline artifacts", async () => {
    const plan = await Effect.runPromise(
      planPersonalAgentInstall({
        hermesExtensionsDir: "/tmp/hermes/ext",
        clineConfigPath: "/tmp/cline/config.json",
        mcpEndpoint: "http://127.0.0.1:8080/mcp",
        inferenceEndpoint: "http://127.0.0.1:8091/v1",
      })
    );
    expect(plan.hermesWormAgentDest).toContain("worm_agent.py");
    expect(plan.hermesYamlSnippet).toContain("runtime_class");
    expect(plan.clineConfig.mcp).toBeDefined();
    expect(plan.atr.cline.toolsInScope).toContain("memory_recall");
  });

  it("materializes files under a temp home", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-pa-"));
    try {
      const plan = await Effect.runPromise(
        installPersonalAgentHooks({
          hermesExtensionsDir: join(dir, "hermes"),
          clineConfigPath: join(dir, "cline", "config.json"),
          mcpEndpoint: "http://127.0.0.1:8080/mcp",
          inferenceEndpoint: "http://127.0.0.1:8091/v1",
        })
      );
      const py = await readFile(plan.hermesWormAgentDest, "utf8");
      expect(py).toContain("WORMInstrumentedAgent");
      const cfg = JSON.parse(await readFile(join(dir, "cline", "config.json"), "utf8"));
      expect(cfg.mcp.servers[0].url).toContain("/mcp");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("OpenClaw live MCP wiring", () => {
  it("emits mcp set commands and ATR-filtered skills", async () => {
    const plan = await Effect.runPromise(
      planOpenClawLiveWiring({
        mcpEndpoint: "http://127.0.0.1:8080/mcp",
        atrScope: OPENCLAW_ATR_TEMPLATES.readonly_assistant,
        discoveredTools: [
          { name: "memory_recall", description: "recall" },
          { name: "execute", description: "exec" },
        ],
        mode: "http",
      })
    );
    expect(plan.commands[0]).toContain("openclaw mcp set clawql");
    expect(plan.commands[0]).toContain("http://127.0.0.1:8080/mcp");
    expect(plan.skills.skills.map((s) => s.name)).toEqual(["clawql_memory_recall"]);
  });
});

describe("getOutboundCredential", () => {
  it("returns bearer for oauth when token present", async () => {
    const persistence = createMemoryOAuthPersistence();
    await persistence.save("t:google:u", {
      accessToken: "ya29.test",
      expiresAtMs: Date.now() + 3_600_000,
    });
    const store = createOAuthTokenStore({
      persistence,
      refresh: async (_k, cur) => cur,
    });
    const apiKeys = createOutboundAPIKeyManager({
      secrets: createMemorySecretSource(),
    });
    const cred = await Effect.runPromise(
      getOutboundCredential({
        tenantId: "t",
        subject: "u",
        provider: "google",
        tokenStore: store,
        apiKeys,
      })
    );
    expect(cred).toEqual({ kind: "bearer", token: "ya29.test" });
  });

  it("returns reauth_required when oauth token missing", async () => {
    const store = createOAuthTokenStore({
      persistence: createMemoryOAuthPersistence(),
      refresh: async (_k, cur) => cur,
    });
    const apiKeys = createOutboundAPIKeyManager({
      secrets: createMemorySecretSource(),
    });
    const cred = await Effect.runPromise(
      getOutboundCredential({
        tenantId: "t",
        subject: "u",
        provider: "google",
        tokenStore: store,
        apiKeys,
      })
    );
    expect(cred.kind).toBe("reauth_required");
    if (cred.kind === "reauth_required") {
      expect(cred.error).toBeInstanceOf(ReauthRequiredError);
    }
  });

  it("returns Authorization header for api_key providers", async () => {
    const store = createOAuthTokenStore({
      persistence: createMemoryOAuthPersistence(),
      refresh: async (_k, cur) => cur,
    });
    const apiKeys = createOutboundAPIKeyManager({
      secrets: createMemorySecretSource({
        "vault://clawql/providers/github/api-key": "ghp_test",
      }),
    });
    const cred = await Effect.runPromise(
      getOutboundCredential({
        tenantId: "t",
        subject: "u",
        provider: "github",
        tokenStore: store,
        apiKeys,
        sessionId: "sess-1",
      })
    );
    expect(cred).toEqual({
      kind: "headers",
      headers: { Authorization: "Bearer ghp_test" },
    });
  });
});

describe("agents OpenBench dry runner", () => {
  it("lists all seven catalog agents", () => {
    expect(catalogAgentsForBench()).toEqual([
      "cline",
      "openclaw",
      "hermes",
      "goose",
      "openhands",
      "pi",
      "deepseek",
    ]);
  });

  it("produces a WORM-complete stub scorecard", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-bench-"));
    try {
      const scorecard = await Effect.runPromise(
        runAgentBenchmarkDry({
          agentName: "cline",
          family: "S",
          tasks: [
            {
              id: "s-smoke-1",
              family: "S",
              title: "memory recall",
              atrScope: CLINE_ATR_TEMPLATES.readonly_recall,
            },
          ],
          config: {
            mcpEndpoint: "http://127.0.0.1:8080/mcp",
            wormDbPath: join(dir, "worm.db"),
            inferenceEndpoint: "http://127.0.0.1:8091/v1",
            virtualKeyId: "vk_test",
            teeEnabled: false,
          },
        })
      );
      expect(scorecard.results).toHaveLength(1);
      expect(scorecard.results[0]?.delta.wormComplete).toBe(true);
      expect(scorecard.results[0]?.delta.cprLift).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

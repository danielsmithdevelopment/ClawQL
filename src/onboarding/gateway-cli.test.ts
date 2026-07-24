import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  loadManagedGatewayState,
  materializeManagedGateway,
  resolveProcessRuntimePaths,
  runGatewayDestroy,
} from "./gateway-cli.js";

describe("managed gateway materials", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-mgw-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("materializes policy, virtual key, and secret.env with secure defaults", async () => {
    const { state, secret } = await materializeManagedGateway({
      home,
      team: "demo",
      port: 18080,
      profile: "process",
    });

    expect(state.version).toBe(1);
    expect(state.team).toBe("demo");
    expect(state.urls.mcp).toBe("http://127.0.0.1:18080/mcp");
    expect(state.urls.inference).toBe("http://127.0.0.1:18080/v1");
    expect(secret.startsWith("clawql-vk-")).toBe(true);

    const policy = await readFile(join(home, "Inference", "policy.yaml"), "utf8");
    expect(policy).toMatch(/keys:\s*\n\s*enabled:\s*true/m);

    const secretEnv = await readFile(join(home, "ManagedGateway", "secret.env"), "utf8");
    expect(secretEnv).toContain("CLAWQL_AUTH_MODE=apiKey");
    expect(secretEnv).toContain("CLAWQL_INFERENCE_KEYS_ENABLED=1");
    expect(secretEnv).toContain(`CLAWQL_API_KEY=${secret}`);
    expect(secretEnv).not.toContain("noAuth");

    const loaded = await loadManagedGatewayState(home);
    expect(loaded?.virtualKeyId).toBe(state.virtualKeyId);
    // State file must not contain the raw secret
    const stateRaw = await readFile(join(home, "ManagedGateway", "gateway.json"), "utf8");
    expect(stateRaw).not.toContain(secret);
  });

  it("resolves process runtimes from a built checkout without requiring Docker", () => {
    const paths = resolveProcessRuntimePaths();
    expect(paths.mcpEntry).toMatch(/server-http\.js$/);
    expect(paths.inferenceBin).toMatch(/clawql-inference\.mjs$/);
    expect(paths.proxyBin).toMatch(/gateway-proxy\.mjs$/);
    expect(existsSync(paths.mcpEntry)).toBe(true);
    expect(existsSync(paths.inferenceBin)).toBe(true);
    expect(existsSync(paths.proxyBin)).toBe(true);
  });

  it("destroy --yes removes ManagedGateway directory", async () => {
    await materializeManagedGateway({
      home,
      team: "demo",
      port: 18081,
      profile: "process",
    });
    expect(existsSync(join(home, "ManagedGateway"))).toBe(true);
    const code = await runGatewayDestroy({ home, yes: true, json: true });
    expect(code).toBe(0);
    expect(existsSync(join(home, "ManagedGateway"))).toBe(false);
  });
});

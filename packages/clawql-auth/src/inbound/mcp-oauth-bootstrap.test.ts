import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { createMcpOAuthFromEnv } from "./mcp-oauth-env.js";
import { McpOAuthBootstrapError } from "./mcp-oauth-bootstrap.js";

describe("MCP OAuth bootstrap fail-closed", () => {
  const saved: Record<string, string | undefined> = {};

  function stash(key: string) {
    if (!(key in saved)) saved[key] = process.env[key];
  }

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
      delete saved[k];
    }
  });

  it("fails createMcpOAuthFromEnv when STRICT and EMA JSON is invalid", async () => {
    stash("CLAWQL_MCP_OAUTH_ENABLED");
    stash("CLAWQL_MCP_OAUTH_SIGNING_SECRET");
    stash("CLAWQL_EMA_ORGS_JSON");
    stash("CLAWQL_MCP_OAUTH_BOOTSTRAP_STRICT");
    stash("CLAWQL_SECRET_STORE");

    process.env.CLAWQL_MCP_OAUTH_ENABLED = "1";
    process.env.CLAWQL_MCP_OAUTH_SIGNING_SECRET = "test-mcp-oauth-signing-secret-32b!!";
    process.env.CLAWQL_EMA_ORGS_JSON = "{not-json";
    process.env.CLAWQL_MCP_OAUTH_BOOTSTRAP_STRICT = "1";
    process.env.CLAWQL_SECRET_STORE = "memory";

    const exit = await Effect.runPromiseExit(createMcpOAuthFromEnv());
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const err = exit.cause;
      const flattened = String(err);
      expect(flattened).toMatch(/McpOAuthBootstrapError|CLAWQL_EMA_ORGS_JSON/);
    }
  });

  it("warns and continues when STRICT is off", async () => {
    stash("CLAWQL_MCP_OAUTH_ENABLED");
    stash("CLAWQL_MCP_OAUTH_SIGNING_SECRET");
    stash("CLAWQL_EMA_ORGS_JSON");
    stash("CLAWQL_MCP_OAUTH_BOOTSTRAP_STRICT");
    stash("CLAWQL_SECRET_STORE");

    process.env.CLAWQL_MCP_OAUTH_ENABLED = "1";
    process.env.CLAWQL_MCP_OAUTH_SIGNING_SECRET = "test-mcp-oauth-signing-secret-32b!!";
    process.env.CLAWQL_EMA_ORGS_JSON = "{not-json";
    delete process.env.CLAWQL_MCP_OAUTH_BOOTSTRAP_STRICT;
    process.env.CLAWQL_SECRET_STORE = "memory";

    const runtime = await Effect.runPromise(createMcpOAuthFromEnv());
    expect(runtime).toBeTruthy();
  });
});

void McpOAuthBootstrapError;

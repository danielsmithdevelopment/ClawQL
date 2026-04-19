/**
 * Smoke test: real stdio MCP handshake against the compiled `dist/server.js`.
 * `npm test` runs `pretest` → `build` so the entry exists.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetSpecCache } from "./spec-loader.js";
import { resetSchemaFieldCache } from "./tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const minimalSpec = join(here, "test-utils/fixtures/minimal-petstore.json");
const serverJs = join(root, "dist", "server.js");

describe("server (stdio)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_SPEC_PATH = process.env.CLAWQL_SPEC_PATH;
    saved.CLAWQL_PROVIDER = process.env.CLAWQL_PROVIDER;
    saved.CLAWQL_SPEC_PATHS = process.env.CLAWQL_SPEC_PATHS;
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    resetSpecCache();
    resetSchemaFieldCache();
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key as keyof typeof saved];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    resetSpecCache();
    resetSchemaFieldCache();
  });

  it("starts, handshakes, and exposes search + execute tools", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-vault-"));
    delete childEnv.CLAWQL_PROVIDER;
    delete childEnv.CLAWQL_SPEC_PATHS;
    delete childEnv.CLAWQL_API_BASE_URL;
    delete childEnv.API_BASE_URL;

    const serverLogs: string[] = [];
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverJs],
      cwd: root,
      env: childEnv,
      stderr: "pipe",
    });

    if (transport.stderr) {
      transport.stderr.on("data", (chunk) => {
        serverLogs.push(chunk.toString());
      });
    }

    const client = new Client({ name: "clawql-stdio-smoke", version: "1.0.0" }, {});

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      expect(names.has("search")).toBe(true);
      expect(names.has("execute")).toBe(true);
      expect(names.has("sandbox_exec")).toBe(true);
      expect(names.has("memory_ingest")).toBe(true);
      expect(names.has("memory_recall")).toBe(true);
      expect(names.has("ingest_external_knowledge")).toBe(true);
      expect(names.has("cache")).toBe(false);
      expect(names.has("audit")).toBe(false);
    } finally {
      await client.close();
    }

    const stderr = serverLogs.join("");
    expect(stderr).toContain("Server running on stdio");
  }, 20_000);

  it("exposes cache when CLAWQL_ENABLE_CACHE=1", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-vault-"));
    childEnv.CLAWQL_ENABLE_CACHE = "1";
    delete childEnv.CLAWQL_PROVIDER;
    delete childEnv.CLAWQL_SPEC_PATHS;
    delete childEnv.CLAWQL_API_BASE_URL;
    delete childEnv.API_BASE_URL;

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverJs],
      cwd: root,
      env: childEnv,
      stderr: "pipe",
    });

    const client = new Client({ name: "clawql-stdio-cache", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      expect(names.has("cache")).toBe(true);
    } finally {
      await client.close();
    }
  }, 20_000);

  it("exposes audit when CLAWQL_ENABLE_AUDIT=1", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-vault-"));
    childEnv.CLAWQL_ENABLE_AUDIT = "1";
    delete childEnv.CLAWQL_PROVIDER;
    delete childEnv.CLAWQL_SPEC_PATHS;
    delete childEnv.CLAWQL_API_BASE_URL;
    delete childEnv.API_BASE_URL;

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverJs],
      cwd: root,
      env: childEnv,
      stderr: "pipe",
    });

    const client = new Client({ name: "clawql-stdio-audit", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      expect(names.has("audit")).toBe(true);
    } finally {
      await client.close();
    }
  }, 20_000);
});

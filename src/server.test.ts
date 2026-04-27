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

  it("starts, handshakes, and exposes search, execute, cache, memory, and audit by default (no vault path)", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    delete childEnv.CLAWQL_OBSIDIAN_VAULT_PATH;
    delete childEnv.CLAWQL_ENABLE_MEMORY;
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
      expect(names.has("cache")).toBe(true);
      expect(names.has("audit")).toBe(true);
      expect(names.has("notify")).toBe(false);
      expect(names.has("knowledge_search_onyx")).toBe(false);
      expect(names.has("ouroboros_create_seed_from_document")).toBe(false);
      expect(names.has("ouroboros_run_evolutionary_loop")).toBe(false);
      expect(names.has("ouroboros_get_lineage_status")).toBe(false);
    } finally {
      await client.close();
    }

    const stderr = serverLogs.join("");
    expect(stderr).toContain("Server running on stdio");
  }, 20_000);

  it("hides memory_ingest and memory_recall when CLAWQL_ENABLE_MEMORY=0", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-vault-"));
    childEnv.CLAWQL_ENABLE_MEMORY = "0";
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

    const client = new Client({ name: "clawql-stdio-memory-off", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      expect(names.has("memory_ingest")).toBe(false);
      expect(names.has("memory_recall")).toBe(false);
      expect(names.has("cache")).toBe(true);
    } finally {
      await client.close();
    }
  }, 20_000);

  it("hides ingest_external_knowledge and knowledge_search_onyx when CLAWQL_ENABLE_DOCUMENTS=0", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-vault-"));
    childEnv.CLAWQL_ENABLE_DOCUMENTS = "0";
    childEnv.CLAWQL_ENABLE_ONYX = "1";
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

    const client = new Client({ name: "clawql-stdio-documents-off", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      expect(names.has("ingest_external_knowledge")).toBe(false);
      expect(names.has("knowledge_search_onyx")).toBe(false);
    } finally {
      await client.close();
    }
  }, 20_000);

  it("exposes notify when CLAWQL_ENABLE_NOTIFY=1", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-vault-"));
    childEnv.CLAWQL_ENABLE_NOTIFY = "1";
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

    const client = new Client({ name: "clawql-stdio-notify", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      expect(names.has("notify")).toBe(true);
    } finally {
      await client.close();
    }
  }, 20_000);

  it("exposes knowledge_search_onyx when CLAWQL_ENABLE_ONYX=1", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-vault-"));
    childEnv.CLAWQL_ENABLE_ONYX = "1";
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

    const client = new Client({ name: "clawql-stdio-onyx", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      expect(names.has("knowledge_search_onyx")).toBe(true);
    } finally {
      await client.close();
    }
  }, 20_000);

  it("exposes ouroboros_* tools when CLAWQL_ENABLE_OUROBOROS=1 (#141)", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-vault-"));
    childEnv.CLAWQL_ENABLE_OUROBOROS = "1";
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

    const client = new Client({ name: "clawql-stdio-ouroboros", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      expect(names.has("ouroboros_create_seed_from_document")).toBe(true);
      expect(names.has("ouroboros_run_evolutionary_loop")).toBe(true);
      expect(names.has("ouroboros_get_lineage_status")).toBe(true);
    } finally {
      await client.close();
    }
  }, 20_000);

  it("stdio ouroboros_run_evolutionary_loop routes through internal execute hint", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATH = minimalSpec;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-vault-"));
    childEnv.CLAWQL_ENABLE_OUROBOROS = "1";
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

    const client = new Client({ name: "clawql-stdio-ouroboros-run", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const runResult = await client.callTool({
        name: "ouroboros_run_evolutionary_loop",
        arguments: {
          seed: {
            goal: "List pets through internal execute",
            task_type: "analysis",
            brownfield_context: {
              project_type: "brownfield",
              context_references: [
                {
                  clawql_execute: {
                    operationId: "listPets",
                    args: {},
                  },
                },
              ],
              existing_patterns: [],
              existing_dependencies: [],
            },
            constraints: [],
            acceptance_criteria: ["Return non-empty output"],
            ontology_schema: {
              name: "TestOntology",
              description: "Test ontology",
              fields: [],
            },
            evaluation_principles: [],
            exit_conditions: [],
            metadata: {
              seed_id: "ouroboros-e2e-seed-1",
              version: "1.0.0",
              created_at: "2026-01-01T00:00:00.000Z",
              ambiguity_score: 0.1,
              interview_id: null,
              parent_seed_id: null,
            },
          },
          maxGenerations: 2,
          convergenceThreshold: 0.8,
        },
      });
      const runText = runResult.content?.find((b) => b.type === "text")?.text;
      expect(runText).toBeDefined();
      const runBody = JSON.parse(runText as string) as { lineageId: string };
      expect(runBody.lineageId).toBe("ouroboros-e2e-seed-1");

      const lineageResult = await client.callTool({
        name: "ouroboros_get_lineage_status",
        arguments: { seedId: runBody.lineageId },
      });
      const lineageText = lineageResult.content?.find((b) => b.type === "text")?.text;
      expect(lineageText).toBeDefined();
      const lineage = JSON.parse(lineageText as string) as {
        generations: Array<{ execution_output?: string }>;
      };
      expect(lineage.generations.length).toBeGreaterThan(0);
      expect(lineage.generations[0]?.execution_output).toContain('"route":"execute"');
      expect(lineage.generations[0]?.execution_output).toContain('"operationId":"listPets"');
    } finally {
      await client.close();
    }
  }, 30_000);

  const slackOpenapi = join(root, "providers", "slack", "openapi.json");
  const petstoreFixture = join(root, "src", "test-utils", "fixtures", "minimal-petstore.json");

  it("stdio callTool notify succeeds with CLAWQL_TEST_SLACK_FETCH_STUB (#136)", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATHS = [slackOpenapi, petstoreFixture].join(",");
    delete childEnv.CLAWQL_SPEC_PATH;
    delete childEnv.CLAWQL_PROVIDER;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(
      join(tmpdir(), "clawql-stdio-notify-calltool-")
    );
    childEnv.CLAWQL_ENABLE_NOTIFY = "1";
    childEnv.CLAWQL_SLACK_TOKEN = "xoxb-test-stub";
    childEnv.CLAWQL_TEST_SLACK_FETCH_STUB = "1";
    childEnv.CLAWQL_TEST_SLACK_FETCH_BODY = JSON.stringify({
      ok: true,
      channel: "C01234567",
      ts: "1700000000.000100",
      message: { text: "from stub" },
    });
    delete childEnv.CLAWQL_API_BASE_URL;
    delete childEnv.API_BASE_URL;

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverJs],
      cwd: root,
      env: childEnv,
      stderr: "pipe",
    });

    const client = new Client({ name: "clawql-stdio-notify-calltool", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "notify",
        arguments: { channel: "C01234567", text: "hello from #136" },
      });
      const block = result.content?.find((b) => b.type === "text");
      expect(block?.text).toBeDefined();
      const j = JSON.parse(block!.text as string) as {
        ok?: boolean;
        channel?: string;
        ts?: string;
      };
      expect(j.ok).toBe(true);
      expect(j.channel).toBe("C01234567");
      expect(j.ts).toBe("1700000000.000100");
    } finally {
      await client.close();
    }
  }, 30_000);

  it("stdio callTool notify maps Slack ok:false via stub (#136)", async () => {
    const childEnv = { ...process.env };
    childEnv.CLAWQL_SPEC_PATHS = [slackOpenapi, petstoreFixture].join(",");
    delete childEnv.CLAWQL_SPEC_PATH;
    delete childEnv.CLAWQL_PROVIDER;
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(
      join(tmpdir(), "clawql-stdio-notify-okfalse-")
    );
    childEnv.CLAWQL_ENABLE_NOTIFY = "1";
    childEnv.CLAWQL_SLACK_TOKEN = "xoxb-test-stub";
    childEnv.CLAWQL_TEST_SLACK_FETCH_STUB = "1";
    childEnv.CLAWQL_TEST_SLACK_FETCH_BODY = JSON.stringify({
      ok: false,
      error: "not_in_channel",
    });
    delete childEnv.CLAWQL_API_BASE_URL;
    delete childEnv.API_BASE_URL;

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverJs],
      cwd: root,
      env: childEnv,
      stderr: "pipe",
    });

    const client = new Client({ name: "clawql-stdio-notify-okfalse", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "notify",
        arguments: { channel: "C01234567", text: "should fail slack-side" },
      });
      const block = result.content?.find((b) => b.type === "text");
      expect(block?.text).toBeDefined();
      const j = JSON.parse(block!.text as string) as {
        error?: string;
        slack?: { ok?: boolean; error?: string };
      };
      expect(j.error).toBe("not_in_channel");
      expect(j.slack?.ok).toBe(false);
    } finally {
      await client.close();
    }
  }, 30_000);

  it("stdio callTool knowledge_search_onyx uses REST with Onyx fetch stub (#144)", async () => {
    const childEnv = { ...process.env };
    delete childEnv.CLAWQL_SPEC_PATH;
    delete childEnv.CLAWQL_SPEC_PATHS;
    childEnv.CLAWQL_PROVIDER = "onyx";
    childEnv.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(
      join(tmpdir(), "clawql-stdio-onyx-calltool-")
    );
    childEnv.CLAWQL_ENABLE_ONYX = "1";
    childEnv.ONYX_BASE_URL = "http://127.0.0.1:9";
    childEnv.ONYX_API_TOKEN = "test-onyx-token";
    childEnv.CLAWQL_TEST_ONYX_FETCH_STUB = "1";
    childEnv.CLAWQL_TEST_ONYX_FETCH_BODY = JSON.stringify({
      query: "from-stub",
      documents: [{ document_id: "doc-1", semantic_identifier: "stub-hit" }],
    });
    delete childEnv.CLAWQL_TEST_SLACK_FETCH_STUB;
    delete childEnv.CLAWQL_API_BASE_URL;
    delete childEnv.API_BASE_URL;

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverJs],
      cwd: root,
      env: childEnv,
      stderr: "pipe",
    });

    const client = new Client({ name: "clawql-stdio-onyx-calltool", version: "1.0.0" }, {});
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "knowledge_search_onyx",
        arguments: { query: "enterprise policy" },
      });
      const block = result.content?.find((b) => b.type === "text");
      expect(block?.text).toBeDefined();
      expect(block!.text).toContain("from-stub");
      expect(block!.text).toContain("stub-hit");
    } finally {
      await client.close();
    }
  }, 30_000);
});

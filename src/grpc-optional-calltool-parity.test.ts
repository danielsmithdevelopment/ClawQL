/**
 * gRPC CallTool wire-path for optional plugins (schedule / notify / onyx / hitl / ouroboros).
 * Complements ListTools coverage in grpc-listtools-parity.test.ts.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetSpecCache } from "clawql-api";
import { resetClawqlApiForTests } from "./composition/clawql-api-adapters.js";
import { instanceSpecWith } from "./host/server-stdio-env.js";
import { resetSchemaFieldCache } from "./mcp/tools.js";
import {
  GRPC_PARITY_MINIMAL_SPEC,
  callToolOnEphemeralGrpcServer,
} from "./test-utils/grpc-mcp-parity.js";

describe("gRPC CallTool optional-tool parity", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
    process.env.CLAWQL_SPEC_PATH = GRPC_PARITY_MINIMAL_SPEC;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    delete process.env.CLAWQL_SCHEDULE_DB_PATH;
    resetClawqlApiForTests();
    resetSpecCache();
    resetSchemaFieldCache();
  });

  afterEach(() => {
    process.env = { ...saved };
    resetClawqlApiForTests();
    resetSpecCache();
    resetSchemaFieldCache();
  });

  it("schedule list returns JSON over CallTool", async () => {
    const vault = mkdtempSync(join(tmpdir(), "clawql-grpc-ct-sched-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vault;
    process.env.CLAWQL_INSTANCE_SPEC = instanceSpecWith({
      automation: { schedule: { enabled: true } },
    });
    process.env.CLAWQL_SCHEDULE_DB_PATH = join(vault, "schedule.db");

    const text = await callToolOnEphemeralGrpcServer("schedule", { operation: "list" });
    expect(text.length).toBeGreaterThan(0);
    const body = JSON.parse(text) as { ok?: boolean; jobs?: unknown };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.jobs)).toBe(true);
  }, 30_000);

  it("notify returns structured error over CallTool without Slack execute", async () => {
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-grpc-ct-notify-"));
    process.env.CLAWQL_INSTANCE_SPEC = instanceSpecWith({
      automation: { notify: { enabled: true } },
    });

    const text = await callToolOnEphemeralGrpcServer("notify", {
      channel: "#test",
      text: "hello",
    });
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toMatch(/error|slack|execute|notify|operation/);
  }, 30_000);

  it("knowledge_search_onyx returns structured JSON over CallTool", async () => {
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-grpc-ct-onyx-"));
    process.env.CLAWQL_INSTANCE_SPEC = instanceSpecWith({
      documents: { enabled: true, onyx: { enabled: true } },
    });

    const text = await callToolOnEphemeralGrpcServer("knowledge_search_onyx", {
      query: "parity",
    });
    expect(text.length).toBeGreaterThan(0);
    const body = JSON.parse(text) as { error?: string };
    // Petstore fixture has no Onyx op — expect the known index error (proves CallTool routed).
    expect(body.error).toMatch(/Onyx search operation/i);
  }, 30_000);

  it("hitl_enqueue_label_studio returns structured JSON over CallTool", async () => {
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-grpc-ct-hitl-"));
    process.env.CLAWQL_INSTANCE_SPEC = instanceSpecWith({
      automation: { hitlLabelStudio: { enabled: true } },
    });

    const text = await callToolOnEphemeralGrpcServer("hitl_enqueue_label_studio", {
      project_id: 1,
      data: "{}",
    });
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toMatch(/error|label.?studio|config|url|token/);
  }, 30_000);

  it("ouroboros_get_lineage_status returns structured JSON over CallTool", async () => {
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-grpc-ct-ouro-"));
    delete process.env.CLAWQL_ENABLE_OUROBOROS;
    delete process.env.CLAWQL_INSTANCE_SPEC;

    const text = await callToolOnEphemeralGrpcServer("ouroboros_get_lineage_status", {
      seedId: "missing-seed",
    });
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toMatch(/seed|lineage|error|missing|not found|ok/);
  }, 30_000);
});

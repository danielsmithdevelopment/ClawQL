import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { handleAuditToolInput, resetClawqlAuditBufferForTests } from "./clawql-audit.js";
import {
  buildMcpToolAuditAppend,
  recordMcpToolCallAudit,
  summarizeMcpToolArgs,
} from "./mcp-tool-audit.js";

describe("mcp-tool-audit", () => {
  const saved = process.env.CLAWQL_AUDIT_TOOL_CALLS;

  afterEach(() => {
    resetClawqlAuditBufferForTests();
    if (saved === undefined) delete process.env.CLAWQL_AUDIT_TOOL_CALLS;
    else process.env.CLAWQL_AUDIT_TOOL_CALLS = saved;
  });

  it("summarizes memory_ingest without dumping insights", () => {
    const s = summarizeMcpToolArgs("memory_ingest", {
      title: "Session notes",
      append: true,
      insights: "secret-ish body ".repeat(20),
    });
    expect(s).toContain("title=Session notes");
    expect(s).toContain("insightsChars=");
    expect(s).not.toContain("secret-ish");
  });

  it("redacts token keys in default JSON summary", () => {
    const s = summarizeMcpToolArgs("notify", { channel: "C1", token: "super-secret" });
    expect(s).toContain("[redacted]");
    expect(s).not.toContain("super-secret");
  });

  it("skips the audit tool to avoid recursion", async () => {
    const params = await Effect.runPromise(
      buildMcpToolAuditAppend({
        toolName: "audit",
        args: { operation: "append", category: "x", action: "y", summary: "z" },
        outcome: "ok",
      })
    );
    expect(params).toBeNull();
  });

  it("appends a mcp_tool row for search", async () => {
    delete process.env.CLAWQL_AUDIT_TOOL_CALLS;
    await recordMcpToolCallAudit({
      toolName: "search",
      args: { query: "pets", correlationId: "c-search" },
      outcome: "ok",
      result: { content: [{ type: "text", text: "hits" }] },
    });
    const listed = await handleAuditToolInput({ operation: "list", limit: 10 });
    const body = JSON.parse(listed.content[0].text) as {
      entries: { category: string; action: string; summary: string; correlationId?: string }[];
    };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.category).toBe("mcp_tool");
    expect(body.entries[0]?.action).toBe("search");
    expect(body.entries[0]?.summary).toContain("query=pets");
    expect(body.entries[0]?.correlationId).toBe("c-search");
  });

  it("no-ops when CLAWQL_AUDIT_TOOL_CALLS=0", async () => {
    process.env.CLAWQL_AUDIT_TOOL_CALLS = "0";
    await recordMcpToolCallAudit({
      toolName: "execute",
      args: { operationId: "x" },
      outcome: "ok",
    });
    const listed = await handleAuditToolInput({ operation: "list", limit: 10 });
    const body = JSON.parse(listed.content[0].text) as { entries: unknown[] };
    expect(body.entries).toHaveLength(0);
  });
});

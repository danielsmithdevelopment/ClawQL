import { afterEach, describe, expect, it } from "vitest";
import {
  getClawqlAuditMaxEntries,
  handleAuditToolInput,
  resetClawqlAuditBufferForTests,
} from "./clawql-audit.js";

describe("clawql-audit", () => {
  const saved = process.env.CLAWQL_AUDIT_MAX_ENTRIES;

  afterEach(() => {
    resetClawqlAuditBufferForTests();
    if (saved === undefined) delete process.env.CLAWQL_AUDIT_MAX_ENTRIES;
    else process.env.CLAWQL_AUDIT_MAX_ENTRIES = saved;
  });

  it("append and list round-trip", async () => {
    const a = await handleAuditToolInput({
      operation: "append",
      category: "tool",
      action: "execute",
      summary: "called petstore",
      correlationId: "c1",
    });
    const ja = JSON.parse(a.content[0].text) as { ok: boolean; total: number };
    expect(ja.ok).toBe(true);
    expect(ja.total).toBe(1);

    const b = await handleAuditToolInput({ operation: "list", limit: 10 });
    const jb = JSON.parse(b.content[0].text) as {
      entries: { category: string; action: string; summary: string; correlationId?: string }[];
    };
    expect(jb.entries).toHaveLength(1);
    expect(jb.entries[0].category).toBe("tool");
    expect(jb.entries[0].correlationId).toBe("c1");
  });

  it("evicts oldest when over CLAWQL_AUDIT_MAX_ENTRIES", async () => {
    process.env.CLAWQL_AUDIT_MAX_ENTRIES = "2";
    expect(getClawqlAuditMaxEntries()).toBe(2);

    await handleAuditToolInput({
      operation: "append",
      category: "a",
      action: "1",
      summary: "first",
    });
    await handleAuditToolInput({
      operation: "append",
      category: "a",
      action: "2",
      summary: "second",
    });
    await handleAuditToolInput({
      operation: "append",
      category: "a",
      action: "3",
      summary: "third",
    });

    const r = await handleAuditToolInput({ operation: "list", limit: 10 });
    const j = JSON.parse(r.content[0].text) as { entries: { summary: string }[] };
    expect(j.entries.map((e) => e.summary)).toEqual(["second", "third"]);
  });

  it("clear empties buffer", async () => {
    await handleAuditToolInput({
      operation: "append",
      category: "x",
      action: "y",
      summary: "z",
    });
    const c = await handleAuditToolInput({ operation: "clear" });
    const jc = JSON.parse(c.content[0].text) as { cleared: number };
    expect(jc.cleared).toBe(1);

    const l = await handleAuditToolInput({ operation: "list" });
    const jl = JSON.parse(l.content[0].text) as { total: number; entries: unknown[] };
    expect(jl.total).toBe(0);
    expect(jl.entries).toHaveLength(0);
  });

  it("rejects append without summary", async () => {
    await expect(
      handleAuditToolInput({
        operation: "append",
        category: "a",
        action: "b",
        summary: "   ",
      })
    ).rejects.toThrow();
  });
});

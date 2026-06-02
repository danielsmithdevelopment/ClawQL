import { afterEach, describe, expect, it } from "vitest";
import { getClawqlAuditMaxEntries } from "./config.js";
import { createAuditRingBuffer } from "./ring-buffer.js";

describe("audit ring buffer", () => {
  const saved = process.env.CLAWQL_AUDIT_MAX_ENTRIES;

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAWQL_AUDIT_MAX_ENTRIES;
    else process.env.CLAWQL_AUDIT_MAX_ENTRIES = saved;
  });

  it("evicts oldest when over max entries", () => {
    process.env.CLAWQL_AUDIT_MAX_ENTRIES = "2";
    expect(getClawqlAuditMaxEntries()).toBe(2);
    const buffer = createAuditRingBuffer(getClawqlAuditMaxEntries);
    const mk = (summary: string) => ({
      ts: new Date().toISOString(),
      category: "a",
      action: "x",
      summary,
    });
    buffer.append(mk("first"));
    buffer.append(mk("second"));
    const { dropped } = buffer.append(mk("third"));
    expect(dropped).toBe(1);
    const list = buffer.list(10);
    expect(list.entries.map((e) => e.summary)).toEqual(["second", "third"]);
  });
});

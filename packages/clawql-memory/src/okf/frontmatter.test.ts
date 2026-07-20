import { describe, expect, it } from "vitest";
import {
  buildOkfFrontmatterString,
  ensureOkfFrontmatter,
  parseVaultFrontmatter,
  resolveNoteTimestampIso,
  resolveOkfType,
} from "./frontmatter.js";
import { DEFAULT_OKF_MEMORY_TYPE, OKF_MEMORY_TYPES } from "./types.js";

describe("okf frontmatter", () => {
  it("defaults type to context", () => {
    expect(resolveOkfType(undefined)).toBe(DEFAULT_OKF_MEMORY_TYPE);
    expect(resolveOkfType("  decision ")).toBe("decision");
  });

  it("serializes OKF-required type and ClawQL extensions", () => {
    const fm = buildOkfFrontmatterString({
      title: "Test Note",
      type: "decision",
      description: "Short summary",
      tags: ["architecture"],
      timestamp: "2026-07-20T03:00:00.000Z",
      correlationId: "corr-1",
      wormRef: "abc123",
      agentId: "agent-a",
      verdict: "accepted",
    });
    expect(fm).toContain('type: "decision"');
    expect(fm).toContain('title: "Test Note"');
    expect(fm).toContain('description: "Short summary"');
    expect(fm).toContain("clawql-ingest");
    expect(fm).toContain("architecture");
    expect(fm).toContain('timestamp: "2026-07-20T03:00:00.000Z"');
    expect(fm).toContain('correlation_id: "corr-1"');
    expect(fm).toContain('worm_ref: "abc123"');
    expect(fm).toContain('agent_id: "agent-a"');
    expect(fm).toContain('verdict: "accepted"');
    expect(fm).toContain("clawql_ingest: true");
    expect(fm).toContain("clawql_okf: true");
    expect(fm).toContain("clawql_ingest_created:");
  });

  it("upgrades legacy frontmatter on ensureOkfFrontmatter", () => {
    const legacy = [
      "---",
      'title: "Legacy"',
      "date: 2026-01-01T00:00:00.000Z",
      "tags: [clawql-ingest]",
      "clawql_ingest: true",
      'clawql_ingest_created: "2026-01-01T00:00:00.000Z"',
      "---",
      "",
      "# Legacy",
      "",
      "body",
      "",
    ].join("\n");
    const next = ensureOkfFrontmatter(legacy, { title: "Legacy" });
    const parsed = parseVaultFrontmatter(next);
    expect(parsed.type).toBe("context");
    expect(parsed.clawql_okf).toBe(true);
    expect(parsed.title).toBe("Legacy");
    expect(resolveNoteTimestampIso(parsed)).toBe("2026-01-01T00:00:00.000Z");
    expect(next).toContain("# Legacy");
    expect(next).toContain("body");
  });

  it("exposes ClawQL OKF type taxonomy", () => {
    expect(OKF_MEMORY_TYPES).toContain("decision");
    expect(OKF_MEMORY_TYPES).toContain("index");
    expect(OKF_MEMORY_TYPES).toContain("log");
  });
});

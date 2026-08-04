import { describe, expect, it } from "vitest";
import {
  buildOkfFrontmatterString,
  ensureOkfFrontmatter,
  isOkfRetracted,
  isOkfStale,
  migrateOkfFrontmatterToV02,
  parseVaultFrontmatter,
  resolveNoteTimestampIso,
  resolveOkfType,
} from "./frontmatter.js";
import { lintOkfMarkdown } from "./lint.js";
import { DEFAULT_OKF_MEMORY_TYPE, OKF_FORMAT_VERSION, OKF_MEMORY_TYPES } from "./types.js";

describe("okf frontmatter (v0.2)", () => {
  it("defaults type to context", () => {
    expect(resolveOkfType(undefined)).toBe(DEFAULT_OKF_MEMORY_TYPE);
    expect(resolveOkfType("  decision ")).toBe("decision");
  });

  it("serializes OKF v0.2 trust signals and ClawQL extensions", () => {
    const fm = buildOkfFrontmatterString({
      title: "Test Note",
      type: "decision",
      description: "Short summary",
      tags: ["architecture"],
      timestamp: "2026-07-28T03:00:00.000Z",
      correlationId: "corr-1",
      wormRef: "abc123",
      agentId: "agent-a",
      verdict: "accepted",
      staleAfter: "2026-10-28T00:00:00.000Z",
      status: "current",
      model: "anthropic/claude-sonnet-4",
      sessionId: "sess-1",
      sources: [{ session_id: "sess-1", turn: 7 }],
      verified: {
        by: "human",
        at: "2026-07-28T04:00:00.000Z",
        method: "pr-review",
        reviewer: "ops@example.com",
      },
    });
    expect(fm).toContain('type: "decision"');
    expect(fm).toContain("generated:");
    expect(fm).toContain('by: "agent-a"');
    expect(fm).toContain('tool: "memory_ingest"');
    expect(fm).toContain('model: "anthropic/claude-sonnet-4"');
    expect(fm).toContain("verified:");
    expect(fm).toContain('method: "pr-review"');
    expect(fm).toContain("sources:");
    expect(fm).toContain('stale_after: "2026-10-28T00:00:00.000Z"');
    expect(fm).toContain('status: "current"');
    expect(fm).toContain(`okf_version: "${OKF_FORMAT_VERSION}"`);
    expect(fm).toContain("clawql_okf: true");

    const parsed = parseVaultFrontmatter(fm + "# body\n");
    expect(parsed.status).toBe("current");
    expect(parsed.okf_version).toBe(OKF_FORMAT_VERSION);
    expect((parsed.generated as { by?: string }).by).toBe("agent-a");
    expect((parsed.verified as { method?: string }).method).toBe("pr-review");
    expect(Array.isArray(parsed.sources)).toBe(true);
  });

  it("upgrades legacy frontmatter to OKF v0.2", () => {
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
    const next = migrateOkfFrontmatterToV02(legacy, "Legacy");
    const parsed = parseVaultFrontmatter(next);
    expect(parsed.type).toBe("context");
    expect(parsed.clawql_okf).toBe(true);
    expect(parsed.status).toBe("current");
    expect(parsed.okf_version).toBe(OKF_FORMAT_VERSION);
    expect(resolveNoteTimestampIso(parsed)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("ensureOkfFrontmatter is idempotent for v0.2 notes", () => {
    const fm = buildOkfFrontmatterString({
      title: "Idem",
      timestamp: "2026-07-28T00:00:00.000Z",
      agentId: "a1",
    });
    const md = `${fm}# Idem\n`;
    expect(ensureOkfFrontmatter(md, { title: "Idem" })).toBe(md);
  });

  it("detects retracted and stale status", () => {
    expect(isOkfRetracted({ status: "retracted" })).toBe(true);
    expect(isOkfRetracted({ status: "current" })).toBe(false);
    expect(
      isOkfStale({ status: "current", stale_after: "2020-01-01T00:00:00.000Z" }, Date.parse("2026-08-01"))
    ).toBe(true);
    expect(
      isOkfStale({ status: "current", stale_after: "2099-01-01T00:00:00.000Z" }, Date.parse("2026-08-01"))
    ).toBe(false);
  });

  it("lints invalid status and past stale_after", () => {
    const bad = [
      "---",
      'type: "context"',
      'title: "X"',
      'status: "nope"',
      'stale_after: "2020-01-01T00:00:00.000Z"',
      "clawql_okf: true",
      "---",
      "",
    ].join("\n");
    const issues = lintOkfMarkdown(bad, { now: new Date("2026-08-01T00:00:00.000Z") });
    expect(issues.some((i) => i.code === "okf.invalid_status")).toBe(true);
    expect(issues.some((i) => i.code === "okf.stale_after_passed")).toBe(true);
  });

  it("exposes ClawQL OKF type taxonomy", () => {
    expect(OKF_MEMORY_TYPES).toContain("decision");
    expect(OKF_MEMORY_TYPES).toContain("index");
    expect(OKF_MEMORY_TYPES).toContain("log");
  });
});

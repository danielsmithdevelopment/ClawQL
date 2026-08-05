import { describe, expect, it } from "vitest";
import { keywordScore, buildMemoryMarkdown } from "./vault.js";
import { searchEdgeOperations, findEdgeOperation } from "./catalog.js";
import { tierFromStripePlan } from "./tenants.js";
import { parseStripeSignatureHeader } from "./stripe-webhook.js";
import { simulateDemoPipeline, DEMO_TTL_MS } from "./demo.js";
import { listMcpTools } from "./tools.js";

describe("keywordScore", () => {
  it("scores overlapping terms", () => {
    expect(keywordScore("vault memory", "R2 vault for agent memory")).toBeGreaterThan(0.5);
    expect(keywordScore("xyzzy", "nothing here")).toBe(0);
  });
});

describe("buildMemoryMarkdown", () => {
  it("builds frontmatter + body", () => {
    const doc = buildMemoryMarkdown(
      { title: "Hello World", content: "body text", tags: ["gtm"] },
      "2026-08-05T00:00:00.000Z"
    );
    expect(doc.path).toBe("hello-world.md");
    expect(doc.body).toContain('title: "Hello World"');
    expect(doc.body).toContain("body text");
  });
});

describe("catalog", () => {
  it("searches edge operations", () => {
    const hits = searchEdgeOperations("memory vault");
    expect(hits.some((h) => h.operationId.startsWith("memory."))).toBe(true);
    expect(findEdgeOperation("cache.get")?.tags).toContain("layer5");
  });
});

describe("tierFromStripePlan", () => {
  it("maps plan hints", () => {
    expect(tierFromStripePlan("Teams")).toBe("teams");
    expect(tierFromStripePlan("shared-starter")).toBe("shared");
    expect(tierFromStripePlan("trial")).toBe("trial");
    expect(tierFromStripePlan(undefined)).toBe("developer");
  });
});

describe("stripe signature parse", () => {
  it("parses t and v1", () => {
    const parsed = parseStripeSignatureHeader("t=123,v1=abc,v1=def");
    expect(parsed).toEqual({ t: "123", v1: ["abc", "def"] });
  });
});

describe("demo pipeline", () => {
  it("marks IDP stages skipped and sets 5-minute TTL constant", () => {
    expect(DEMO_TTL_MS).toBe(5 * 60 * 1000);
    const out = simulateDemoPipeline("lease.pdf", "Sample lease clause");
    expect(out.stages.find((s) => s.id === "ingest")?.status).toBe("ok");
    expect(out.stages.find((s) => s.id === "coneshare")?.status).toBe("skipped");
    expect(out.markdownPreview).toContain("Sample lease");
  });
});

describe("mcp tools", () => {
  it("lists core tools without meters", () => {
    const tools = listMcpTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["search", "execute", "memory_ingest", "memory_recall", "cache"])
    );
    expect(tools.find((t) => t.name === "execute")?.description).toMatch(/Unlimited/i);
  });
});

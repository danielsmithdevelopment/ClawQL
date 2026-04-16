import { describe, expect, it } from "vitest";
import { planVaultMarkdownChunks, vaultChunkId, CHUNK_STRATEGY_PARAGRAPH_V1 } from "./memory-chunk.js";

describe("memory-chunk", () => {
  it("planVaultMarkdownChunks strips frontmatter and splits paragraphs", () => {
    const md = ["---", 'title: "T"', "---", "", "# Hello", "", "First para.", "", "Second para.", ""].join(
      "\n"
    );
    const plan = planVaultMarkdownChunks(md, { maxChunkChars: 2000 });
    expect(plan.indexBody).toContain("# Hello");
    expect(plan.indexBody).not.toContain("title:");
    expect(plan.chunks.length).toBeGreaterThanOrEqual(2);
    const joined = plan.chunks.map((c) => c.text).join("\n");
    expect(joined).toMatch(/First para/);
    expect(joined).toMatch(/Second para/);
  });

  it("splits oversized paragraphs into windows", () => {
    const body = "x".repeat(250);
    const md = `# T\n\n${body}`;
    const plan = planVaultMarkdownChunks(md, { maxChunkChars: 100 });
    expect(plan.chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of plan.chunks) {
      expect(c.text.length).toBeLessThanOrEqual(100);
    }
  });

  it("vaultChunkId is stable for the same inputs", () => {
    const a = vaultChunkId("a/b.md", CHUNK_STRATEGY_PARAGRAPH_V1, 0, "deadbeef");
    const b = vaultChunkId("a/b.md", CHUNK_STRATEGY_PARAGRAPH_V1, 0, "deadbeef");
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });
});

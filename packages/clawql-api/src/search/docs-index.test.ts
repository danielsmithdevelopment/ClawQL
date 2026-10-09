import { Effect } from "effect";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  loadDocsIndexEffect,
  parseDocsIndexJson,
  scoreDocsEntry,
  searchClawqlDocsEffect,
  searchDocsIndex,
} from "./docs-index.js";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/docs-index.json"
);

describe("docs index", () => {
  it("parses flat entries fixture", () => {
    const index = Effect.runSync(loadDocsIndexEffect(fixturePath));
    expect(index).not.toBeNull();
    expect(index!.entries.length).toBeGreaterThanOrEqual(3);
    expect(index!.baseUrl).toContain("docs.clawql.com");
  });

  it("parses apps/docs-style pages+sections", () => {
    const index = parseDocsIndexJson(
      JSON.stringify({
        version: 1,
        baseUrl: "https://docs.example",
        pages: [
          {
            url: "/learn/x",
            sections: [
              ["Page title", null, ["intro about memory"]],
              ["Vault section", "vault", ["Obsidian path details"]],
            ],
          },
        ],
      })
    );
    expect(index.entries).toHaveLength(2);
    expect(index.entries[1]?.url).toBe("/learn/x#vault");
    expect(index.entries[1]?.pageTitle).toBe("Page title");
  });

  it("scores title and content hits", () => {
    const { score, matchedOn } = scoreDocsEntry(
      {
        url: "/mcp/mcp-tools",
        title: "MCP tools reference",
        content: "search execute console_link",
      },
      "console_link mcp tools"
    );
    expect(score).toBeGreaterThan(0);
    expect(matchedOn.some((m) => m.startsWith("title") || m.includes("content"))).toBe(true);
  });

  it("searchDocsIndex returns kind:doc hits for IFC / program mode query", () => {
    const index = Effect.runSync(loadDocsIndexEffect(fixturePath))!;
    const hits = searchDocsIndex(index, "session information-flow program mode", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.kind === "doc")).toBe(true);
    expect(hits.some((h) => /0015|program/i.test(h.title) || h.url.includes("0015"))).toBe(true);
  });

  it("searchClawqlDocsEffect uses CLAWQL_DOCS_INDEX_PATH", async () => {
    const hits = await Effect.runPromise(
      searchClawqlDocsEffect("memory_recall vault", 3, {
        CLAWQL_DOCS_INDEX_PATH: fixturePath,
      })
    );
    expect(hits[0]?.kind).toBe("doc");
    expect(hits[0]?.title.toLowerCase()).toMatch(/memory/);
  });
});

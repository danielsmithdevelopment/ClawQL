import { describe, expect, it } from "vitest";
import { buildUrlIngestNote, formatUrlResponseAsMarkdown } from "./external-ingest-url-format.js";

describe("external-ingest-url-format", () => {
  it("pretty-prints JSON and titles npm registry docs", () => {
    const raw = '{"name":"mcp-grpc-transport","dist-tags":{"latest":"0.1.2"}}';
    const r = formatUrlResponseAsMarkdown(raw, "application/json", "https://registry.npmjs.org/mcp-grpc-transport");
    expect(r.kind).toBe("json");
    expect(r.title).toContain("mcp-grpc-transport");
    expect(r.bodyMarkdown).toContain("```json");
    expect(r.bodyMarkdown).toContain('"latest": "0.1.2"');
  });

  it("detects JSON without Content-Type when body looks like JSON", () => {
    const r = formatUrlResponseAsMarkdown('{"x":1}\n', null, "https://example.com/api");
    expect(r.kind).toBe("json");
    expect(r.bodyMarkdown).toContain('"x": 1');
  });

  it("converts simple HTML to Markdown", () => {
    const html = `<!DOCTYPE html><html><body><h1>Title</h1><p>Hello <strong>world</strong>.</p></body></html>`;
    const r = formatUrlResponseAsMarkdown(html, "text/html", "https://example.com/page");
    expect(r.kind).toBe("html");
    expect(r.bodyMarkdown.toLowerCase()).toContain("title");
    expect(r.bodyMarkdown).toContain("**world**");
  });

  it("wraps plain text when not HTML or JSON", () => {
    const r = formatUrlResponseAsMarkdown("plain line\n", "text/plain", "https://example.com/a.txt");
    expect(r.kind).toBe("text");
    expect(r.bodyMarkdown).toContain("```text");
    expect(r.bodyMarkdown).toContain("plain line");
  });

  it("buildUrlIngestNote includes kind in frontmatter", () => {
    const note = buildUrlIngestNote(
      "https://registry.npmjs.org/foo",
      {
        kind: "json",
        title: "npm · foo",
        bodyMarkdown: "## Data\n\n```json\n{}\n```\n",
      },
      "2026-04-17T12:00:00.000Z"
    );
    expect(note).toContain("clawql_external_ingest_kind: json");
    expect(note).toContain("source_url:");
  });
});

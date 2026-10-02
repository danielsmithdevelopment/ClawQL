/**
 * Regression: evidence headers for code paths + doc §/% metadata.
 * Run: node --test benchmarks/pageindex-ab/scripts/format_section_evidence.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  annotateSectionsForEvidence,
  formatSectionEvidence,
} from "./retrieval_helpers.mjs";

describe("formatSectionEvidence", () => {
  it("prefixes code chunks with // file: path", () => {
    const out = formatSectionEvidence({
      id: "src/index.ts",
      title: "src/index.ts",
      content: 'export { scaleInterest } from "./core.js";\n',
    });
    assert.ok(out.startsWith("// file: src/index.ts\n"));
    assert.match(out, /export \{ scaleInterest \}/);
  });

  it("does not double-prefix code", () => {
    const once = formatSectionEvidence({
      id: "src/core.ts",
      content: "export const X = 1;\n",
    });
    const twice = formatSectionEvidence({ id: "src/core.ts", content: once });
    assert.equal(twice, once);
  });

  it("builds doc header with title, section number, heading, percent", () => {
    const out = formatSectionEvidence(
      {
        id: "sec-9-parsers",
        title: "9 Parsers",
        content: "A JSON parser transforms…\n",
      },
      { docTitle: "rfc8259", sectionIndex: 8, sectionCount: 14 }
    );
    assert.ok(
      out.startsWith("### rfc8259 · §9 · 9 Parsers · ~61% through document\n\n")
    );
  });

  it("annotateSectionsForEvidence attaches indices", () => {
    const ann = annotateSectionsForEvidence(
      [
        { id: "a", title: "1 A", content: "x" },
        { id: "b", title: "2 B", content: "y" },
      ],
      "Doc"
    );
    assert.equal(ann[0].sectionIndex, 0);
    assert.equal(ann[1].sectionIndex, 1);
    assert.equal(ann[1].sectionCount, 2);
    assert.equal(ann[0].docTitle, "Doc");
  });
});

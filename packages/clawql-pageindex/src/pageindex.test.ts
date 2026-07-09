import { describe, expect, it } from "vitest";

import { buildPageIndexFromMarkdown } from "./builder.js";
import { FilePageIndexStorage } from "./storage/file-storage.js";
import { synthesizePageIndex, traversePageIndex } from "./traversal.js";

describe("clawql-pageindex", () => {
  const md = `# Loan file

Preamble about the borrower.

## Income

W-2 wages: $120,000.

## Assets

Checking balance $40,000.
`;

  it("builds nodes from markdown headings", () => {
    const doc = buildPageIndexFromMarkdown("loan-1", md);
    expect(Object.keys(doc.nodes).length).toBeGreaterThan(2);
    expect(doc.nodes[doc.rootId]).toBeDefined();
  });

  it("traverses and synthesizes within token budget", () => {
    const doc = buildPageIndexFromMarkdown("loan-1", md);
    const hits = traversePageIndex(doc, "income wages");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.title.toLowerCase()).toContain("income");

    const syn = synthesizePageIndex(doc, "assets checking", { tokenBudget: 500 });
    expect(syn.text.toLowerCase()).toContain("checking");
    expect(syn.nodeIds.length).toBeGreaterThan(0);
  });

  it("persists to file storage", async () => {
    const path = `/tmp/clawql-pageindex-test-${Date.now()}.json`;
    const store = new FilePageIndexStorage(path);
    const doc = buildPageIndexFromMarkdown("doc-a", md);
    await store.put(doc);
    const loaded = await store.get("doc-a");
    expect(loaded?.docId).toBe("doc-a");
  });
});

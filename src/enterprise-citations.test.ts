import { describe, expect, it } from "vitest";
import {
  enterpriseCitationsFromOnyxSearchToolText,
  extractEnterpriseCitationsFromOnyxSearchJson,
  normalizeEnterpriseCitations,
  stableEnterpriseCitationsPayload,
} from "./enterprise-citations.js";

describe("enterprise-citations", () => {
  it("extracts from documents[] shape", () => {
    const cites = extractEnterpriseCitationsFromOnyxSearchJson({
      query: "q",
      documents: [
        {
          document_id: "d1",
          semantic_identifier: "Policy / Refunds",
          link: "https://intranet.example/p/1",
          chunks: [{ content: "Refund within 30 days." }],
        },
      ],
    });
    expect(cites).toHaveLength(1);
    expect(cites[0].document_id).toBe("d1");
    expect(cites[0].title).toBe("Policy / Refunds");
    expect(cites[0].url).toBe("https://intranet.example/p/1");
    expect(cites[0].snippet).toContain("Refund");
  });

  it("stableEnterpriseCitationsPayload is order-insensitive", () => {
    const a = normalizeEnterpriseCitations([
      { document_id: "b", title: "B" },
      { document_id: "a", title: "A" },
    ])!;
    const b = normalizeEnterpriseCitations([
      { document_id: "a", title: "A" },
      { document_id: "b", title: "B" },
    ])!;
    expect(stableEnterpriseCitationsPayload(a)).toBe(stableEnterpriseCitationsPayload(b));
  });

  it("enterpriseCitationsFromOnyxSearchToolText parses tool JSON", () => {
    const text = JSON.stringify({
      documents: [{ document_id: "x", semantic_identifier: "S", link: "https://x" }],
    });
    const r = enterpriseCitationsFromOnyxSearchToolText(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.citations).toHaveLength(1);
  });

  it("enterpriseCitationsFromOnyxSearchToolText surfaces execute errors", () => {
    const r = enterpriseCitationsFromOnyxSearchToolText(JSON.stringify({ error: "not found" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/);
  });
});

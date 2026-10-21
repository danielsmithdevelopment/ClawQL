import { describe, expect, it } from "vitest";
import {
  annotateSnippetWithTrust,
  applyTrustRankAdjust,
  noteIsUntrustedLabeled,
  noteTrustClass,
} from "./trust-provenance.js";

describe("trust-provenance", () => {
  it("detects labeled-untrusted notes", () => {
    expect(noteIsUntrustedLabeled("tags: [clawql-untrusted]\nprice 99.99")).toBe(true);
    expect(noteTrustClass("price_usd: 15.00")).toBe("trusted");
  });

  it("does not boost zero scores (avoids spurious keyword seeds)", () => {
    expect(applyTrustRankAdjust(0, "unrelated trusted note")).toBe(0);
    expect(applyTrustRankAdjust(1, "weak match")).toBe(3);
  });

  it("ranks trusted above labeled poison on equal keyword strength", () => {
    const trusted = applyTrustRankAdjust(10, "SKU-ACME-100 price_usd: 15.00");
    const poison = applyTrustRankAdjust(
      10,
      "SKU-ACME-100 **clawql_trust:** untrusted\nprice_usd: 99.99"
    );
    expect(trusted).toBeGreaterThan(poison);
  });

  it("annotates untrusted snippets with provenance", () => {
    const snip = annotateSnippetWithTrust(
      "price is 99.99",
      "**clawql_trust:** untrusted\nprice is 99.99"
    );
    expect(snip).toContain("clawql_trust: untrusted");
    expect(snip).toContain("99.99");
  });
});

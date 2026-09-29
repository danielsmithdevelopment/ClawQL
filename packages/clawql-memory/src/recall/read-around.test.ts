import { describe, expect, it } from "vitest";
import { readAroundFromMarkdown, splitMarkdownSections } from "./read-around.js";

const DOC = `# Handbook

Intro text.

## Protocols

The orchid protocol identifier is orchid-77.

## Retention

### Detail

Retention is 4.2 years.
`;

describe("read_around", () => {
  it("splits ATX headings into stable section ids", () => {
    const sections = splitMarkdownSections(DOC);
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("sec-handbook");
    expect(ids).toContain("sec-protocols");
    expect(ids).toContain("sec-retention");
    expect(ids).toContain("sec-detail");
  });

  it("returns section by id", () => {
    const r = readAroundFromMarkdown(DOC, { sectionId: "sec-protocols", tokenBudget: 200 });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/orchid-77/);
    expect(r.section_id).toBe("sec-protocols");
  });

  it("locates section from chunk text", () => {
    const r = readAroundFromMarkdown(DOC, { chunkText: "orchid-77" });
    expect(r.ok).toBe(true);
    expect(r.section_id).toBe("sec-protocols");
  });
});

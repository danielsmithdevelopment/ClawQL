import { describe, expect, it } from "vitest";
import {
  formatSectionEvidence,
  isArtifactHeadingTitle,
  readAroundFromMarkdown,
  splitMarkdownSections,
} from "./read-around.js";

const DOC = `# Handbook

Intro text.

## Protocols

The orchid protocol identifier is orchid-77.

## Retention

### Detail

Retention is 4.2 years.
`;

describe("read_around", () => {
  it("detects TOC / list-step artifact heading titles", () => {
    expect(isArtifactHeadingTitle("1 Introduction  . . . . . . . .   3")).toBe(true);
    expect(
      isArtifactHeadingTitle("1 Introduction ....................................................3")
    ).toBe(true);
    expect(
      isArtifactHeadingTitle('1 If the field value is "*", the condition is false if the origin')
    ).toBe(true);
    expect(isArtifactHeadingTitle("1 Introduction")).toBe(false);
    expect(isArtifactHeadingTitle("4.7 Specifying HTTP Header Fields")).toBe(false);
    expect(isArtifactHeadingTitle("48155 Münster")).toBe(true);
  });

  it("skips TOC ghosts when splitting sections", () => {
    const contaminated = `# RFC8259

## 1 Introduction  . . . . . . . . . . . . . . . . . . . . . . . .   3

## 5 Arrays  . . . . . . . . . . . . . . . . . . . . . . . . . . .   7

## 1 Introduction

JSON is a text format.

## 5 Arrays

An array structure is represented as square brackets.
`;
    const sections = splitMarkdownSections(contaminated);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("1 Introduction");
    expect(titles).toContain("5 Arrays");
    expect(titles.some((t) => t.includes(". . ."))).toBe(false);
    expect(sections.filter((s) => s.title === "1 Introduction")).toHaveLength(1);
  });

  it("skips numbered list/procedure steps mistaken for headings", () => {
    const doc = `# JWT

## 7 Creating a JWT

1. Create claims.
2. Sign.

## 1 Create a JWT Claims Set containing the desired claims. Note that

This line was wrongly promoted to ATX in a bad converter.

## 5 Verify that the resulting JOSE Header includes only parameters

Also a procedure step, not a section.

## 8 Validating a JWT

Validation steps follow.
`;
    const sections = splitMarkdownSections(doc);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("7 Creating a JWT");
    expect(titles).toContain("8 Validating a JWT");
    expect(titles.some((t) => t.startsWith("1 Create a JWT Claims"))).toBe(false);
    expect(titles.some((t) => t.startsWith("5 Verify that"))).toBe(false);
  });

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

  it("prefixes evidence with doc title, heading, and percent position", () => {
    const r = readAroundFromMarkdown(DOC, { sectionId: "sec-protocols", tokenBudget: 400 });
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/^### Handbook · Protocols · ~\d+% through document/);
    expect(r.content).toMatch(/orchid-77/);
  });

  it("formatSectionEvidence prefixes code with // file: path", () => {
    const out = formatSectionEvidence({
      id: "src/index.ts",
      title: "src/index.ts",
      content: 'export { foo } from "./core.js";\n',
    });
    expect(out.startsWith("// file: src/index.ts\n")).toBe(true);
    expect(out).toContain("export { foo }");
  });

  it("formatSectionEvidence includes section number when present in title", () => {
    const out = formatSectionEvidence(
      {
        id: "sec-1-introduction",
        title: "1 Introduction",
        content: "JSON is a text format.\n",
      },
      { docTitle: "rfc8259", sectionIndex: 0, sectionCount: 10 }
    );
    expect(out.startsWith("### rfc8259 · §1 · 1 Introduction · ~5% through document")).toBe(true);
  });

  it("locates section from chunk text", () => {
    const r = readAroundFromMarkdown(DOC, { chunkText: "orchid-77" });
    expect(r.ok).toBe(true);
    expect(r.section_id).toBe("sec-protocols");
  });
});

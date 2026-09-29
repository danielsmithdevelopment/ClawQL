import { describe, expect, it } from "vitest";
import {
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
    expect(isArtifactHeadingTitle("1 Introduction ....................................................3")).toBe(
      true
    );
    expect(
      isArtifactHeadingTitle('1 If the field value is "*", the condition is false if the origin')
    ).toBe(true);
    expect(isArtifactHeadingTitle("1 Introduction")).toBe(false);
    expect(isArtifactHeadingTitle("4.7 Specifying HTTP Header Fields")).toBe(false);
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

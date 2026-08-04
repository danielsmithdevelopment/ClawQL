import { describe, expect, it } from "vitest";
import {
  catalogCandidatePaths,
  indexFirstRecallEnabled,
  parseOkfIndexCatalog,
  parseOkfRecentLog,
  scoreCatalogEntries,
  type OkfIndexSurvey,
} from "./index-survey.js";

const SAMPLE_INDEX = `---
type: "index"
title: "Memory index"
---

# Memory index

## Summary

- **Notes:** 3
- **Recall subtree:** \`Memory/\`

## By folder

### \`Memory/\`

- [[JWT over sessions]] \`(Memory/auth-jwt-over-sessions.md)\`
- [[GOMAXPROCS pin]] \`(Memory/gomaxprocs.md)\`
- [[Ontology kinetic]] \`(Memory/ontology-kinetic.md)\`

## All notes (A–Z) (3)

- [[GOMAXPROCS pin]]
- [[JWT over sessions]]
- [[Ontology kinetic]]

<!-- clawql-index:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -->
`;

const SAMPLE_LOG = `---
type: "log"
---

# Memory vault log

## 2026-08-04

- **2026-08-04T10:00:00.000Z** — [[JWT over sessions]] (\`Memory/auth-jwt-over-sessions.md\`) type=\`decision\` · correlation \`sess-1\`
- **2026-08-04T12:00:00.000Z** — [[Ontology kinetic]] (\`Memory/ontology-kinetic.md\`) type=\`decision\`
`;

describe("parseOkfIndexCatalog", () => {
  it("extracts path-bearing catalog rows and note count", () => {
    const { entries, noteCount } = parseOkfIndexCatalog(SAMPLE_INDEX);
    expect(noteCount).toBe(3);
    const withPath = entries.filter((e) => e.path);
    expect(withPath.length).toBeGreaterThanOrEqual(3);
    expect(withPath.some((e) => e.path === "Memory/auth-jwt-over-sessions.md")).toBe(true);
  });
});

describe("scoreCatalogEntries", () => {
  it("ranks JWT catalog entry above unrelated titles", () => {
    const { entries } = parseOkfIndexCatalog(SAMPLE_INDEX);
    const hits = scoreCatalogEntries("jwt sessions authentication", entries, 5);
    expect(hits[0]?.path).toBe("Memory/auth-jwt-over-sessions.md");
    expect(hits[0]!.score).toBeGreaterThan(0);
  });
});

describe("parseOkfRecentLog", () => {
  it("returns newest first", () => {
    const recent = parseOkfRecentLog(SAMPLE_LOG, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.path).toBe("Memory/ontology-kinetic.md");
    expect(recent[1]!.path).toBe("Memory/auth-jwt-over-sessions.md");
  });
});

describe("catalogCandidatePaths", () => {
  it("unions catalog hits and recent log paths", () => {
    const survey: OkfIndexSurvey = {
      indexFound: true,
      catalogHits: [
        { title: "JWT", path: "Memory/auth-jwt-over-sessions.md", score: 5 },
        { title: "CPU", path: "Memory/gomaxprocs.md", score: 2 },
      ],
      recentLog: [{ timestamp: "t", title: "Ontology", path: "Memory/ontology-kinetic.md" }],
      surveyTokenEstimate: 100,
    };
    const paths = catalogCandidatePaths(survey, 10);
    expect(paths).toEqual([
      "Memory/auth-jwt-over-sessions.md",
      "Memory/gomaxprocs.md",
      "Memory/ontology-kinetic.md",
    ]);
  });
});

describe("indexFirstRecallEnabled", () => {
  it("defaults to on", () => {
    const saved = process.env.CLAWQL_MEMORY_RECALL_INDEX_FIRST;
    delete process.env.CLAWQL_MEMORY_RECALL_INDEX_FIRST;
    try {
      expect(indexFirstRecallEnabled()).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_MEMORY_RECALL_INDEX_FIRST;
      else process.env.CLAWQL_MEMORY_RECALL_INDEX_FIRST = saved;
    }
  });
});

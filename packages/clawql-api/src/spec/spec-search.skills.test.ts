import { describe, expect, it } from "vitest";
import type { SkillIndexEntry } from "clawql-core";
import {
  formatSearchResults,
  mergeRankedHits,
  scoreSkillIndexEntry,
  searchOperations,
  searchSkills,
} from "./spec-search.js";
import type { Operation } from "./operation-types.js";

const handoff: SkillIndexEntry = {
  skillId: "session-handoff",
  name: "Session handoff",
  description: "Summarize this session for handoff to another agent",
  digest: "abc",
  pluginId: "handoff",
  applicability: "always",
  source: "standalone",
};

const matchedOnly: SkillIndexEntry = {
  skillId: "pr-review-checklist",
  name: "PR review checklist",
  description: "Checklist for reviewing pull requests",
  digest: "def",
  pluginId: "github",
  applicability: "query-matched",
  source: "provider",
  scopeTokens: ["github.pulls.get", "github.pulls.listReviews"],
};

describe("skill search ranking", () => {
  it("always includes always-applicable skills even without term hits", () => {
    const hits = searchSkills([handoff, matchedOnly], "unrelated xyzzy", 5);
    expect(hits.some((h) => h.skill.skillId === "session-handoff")).toBe(true);
    expect(hits.some((h) => h.skill.skillId === "pr-review-checklist")).toBe(false);
  });

  it("ranks query-matched skills when terms hit", () => {
    const hits = searchSkills([matchedOnly], "pull request review", 5);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.skill.skillId).toBe("pr-review-checklist");
    expect(hits[0]?.score).toBeGreaterThan(0.5);
  });

  it("merges operations and skills by score", () => {
    const op = {
      id: "github.pulls.get",
      method: "GET",
      path: "/pulls/{id}",
      flatPath: "/pulls/{id}",
      resource: "pulls",
      description: "Get a pull request",
      parameters: {},
    } as Operation;
    const opHits = searchOperations([op], "pull request", 5);
    const skillHits = searchSkills([handoff, matchedOnly], "pull request", 5);
    const merged = mergeRankedHits(opHits, skillHits, 5);
    expect(merged.some((h) => h.kind === "operation")).toBe(true);
    expect(merged.some((h) => h.kind === "skill")).toBe(true);
    const formatted = JSON.parse(formatSearchResults(merged)) as {
      results: { kind: string }[];
    };
    expect(formatted.results.every((r) => r.kind === "operation" || r.kind === "skill")).toBe(true);
  });

  it("scoreSkillIndexEntry boosts name and description", () => {
    const { score } = scoreSkillIndexEntry(handoff, "session handoff summarize");
    expect(score).toBeGreaterThan(1);
  });
});

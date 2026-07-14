import { describe, expect, it } from "vitest";
import {
  mapVaultResultToNormalizedHit,
  resolveMemoryRecallSources,
} from "./recall-sources.js";

describe("resolveMemoryRecallSources", () => {
  it("defaults to vault+vector", () => {
    expect([...resolveMemoryRecallSources({})].sort()).toEqual(["vault", "vector"]);
  });

  it("adds codegraph when includeCodeGraph is true", () => {
    const s = resolveMemoryRecallSources({ includeCodeGraph: true });
    expect(s.has("codegraph")).toBe(true);
    expect(s.has("vault")).toBe(true);
  });

  it("adds codegraph when hybrid env flag is on", () => {
    const s = resolveMemoryRecallSources({ hybridCodeGraphEnabled: true });
    expect(s.has("codegraph")).toBe(true);
  });

  it("honors explicit sources list", () => {
    const s = resolveMemoryRecallSources({
      sources: ["codegraph", "onyx"],
      includeCodeGraph: true,
      hybridCodeGraphEnabled: true,
    });
    expect([...s].sort()).toEqual(["codegraph", "onyx"]);
  });
});

describe("mapVaultResultToNormalizedHit", () => {
  it("maps keyword to vault, vector to vector, link to link", () => {
    expect(mapVaultResultToNormalizedHit({
      path: "Memory/a.md",
      score: 2,
      depth: 0,
      reason: "keyword",
      snippet: "x",
    }).source).toBe("vault");
    expect(mapVaultResultToNormalizedHit({
      path: "Memory/a.md",
      score: 2,
      depth: 0,
      reason: "vector",
      snippet: "x",
    }).source).toBe("vector");
    expect(mapVaultResultToNormalizedHit({
      path: "Memory/b.md",
      score: 1,
      depth: 1,
      reason: "link",
      linkFrom: "Memory/a.md",
      snippet: "y",
    }).source).toBe("link");
  });
});

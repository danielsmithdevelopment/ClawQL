import { describe, expect, it } from "vitest";
import { mapVaultResultToNormalizedHit, resolveMemoryRecallSources } from "./recall-sources.js";

describe("resolveMemoryRecallSources", () => {
  it("defaults to vault+vector", () => {
    expect([...resolveMemoryRecallSources({})].sort()).toEqual(["vault", "vector"]);
  });

  it("honors explicit sources list", () => {
    const s = resolveMemoryRecallSources({
      sources: ["onyx"],
    });
    expect([...s].sort()).toEqual(["onyx"]);
  });
});

describe("mapVaultResultToNormalizedHit", () => {
  it("maps keyword to vault, vector to vector, link to link", () => {
    expect(
      mapVaultResultToNormalizedHit({
        path: "Memory/a.md",
        score: 2,
        depth: 0,
        reason: "keyword",
        snippet: "x",
      }).source
    ).toBe("vault");
    expect(
      mapVaultResultToNormalizedHit({
        path: "Memory/a.md",
        score: 2,
        depth: 0,
        reason: "vector",
        snippet: "x",
      }).source
    ).toBe("vector");
    expect(
      mapVaultResultToNormalizedHit({
        path: "Memory/b.md",
        score: 1,
        depth: 1,
        reason: "link",
        linkFrom: "Memory/a.md",
        snippet: "y",
      }).source
    ).toBe("link");
  });
});

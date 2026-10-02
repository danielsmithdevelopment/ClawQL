import { afterEach, describe, expect, it } from "vitest";
import { mapVaultResultToNormalizedHit, resolveMemoryRecallSources } from "./recall-sources.js";

describe("resolveMemoryRecallSources", () => {
  const prevHybrid = process.env.CLAWQL_MEMORY_RECALL_HYBRID;
  const prevOnyx = process.env.CLAWQL_MEMORY_RECALL_HYBRID_ONYX;

  afterEach(() => {
    if (prevHybrid === undefined) delete process.env.CLAWQL_MEMORY_RECALL_HYBRID;
    else process.env.CLAWQL_MEMORY_RECALL_HYBRID = prevHybrid;
    if (prevOnyx === undefined) delete process.env.CLAWQL_MEMORY_RECALL_HYBRID_ONYX;
    else process.env.CLAWQL_MEMORY_RECALL_HYBRID_ONYX = prevOnyx;
  });

  it("defaults to vault+vector", () => {
    delete process.env.CLAWQL_MEMORY_RECALL_HYBRID;
    delete process.env.CLAWQL_MEMORY_RECALL_HYBRID_ONYX;
    expect([...resolveMemoryRecallSources({})].sort()).toEqual(["vault", "vector"]);
  });

  it("ignores removed CLAWQL_MEMORY_RECALL_HYBRID master switch", () => {
    process.env.CLAWQL_MEMORY_RECALL_HYBRID = "1";
    delete process.env.CLAWQL_MEMORY_RECALL_HYBRID_ONYX;
    expect([...resolveMemoryRecallSources({})].sort()).toEqual(["vault", "vector"]);
  });

  it("adds onyx when CLAWQL_MEMORY_RECALL_HYBRID_ONYX=1", () => {
    delete process.env.CLAWQL_MEMORY_RECALL_HYBRID;
    process.env.CLAWQL_MEMORY_RECALL_HYBRID_ONYX = "1";
    expect([...resolveMemoryRecallSources({})].sort()).toEqual(["onyx", "vault", "vector"]);
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

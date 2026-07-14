/**
 * Dogfood ClawQL's own codebase: index real packages and run graph queries.
 *
 * Runs in CI by default (scoped to clawql-codegraph + clawql-memory, ~350 files).
 * Set CLAWQL_CODEGRAPH_DOGFOOD_FULL=1 to index the entire monorepo (local / nightly).
 *
 * Run only dogfood tests:
 *   npm run test:dogfood -w clawql-codegraph
 *   CLAWQL_CODEGRAPH_DOGFOOD_FULL=1 npm run test:dogfood -w clawql-codegraph
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { explainNode, queryGraph, shortestPath, subgraph } from "../graph/operations.js";
import { codegraphIndex, codegraphQuery } from "../mcp/handlers.js";
import {
  defaultDogfoodScope,
  dogfoodIndexRoots,
  dogfoodMaxFiles,
  resolveClawqlRepoRoot,
} from "../test-utils/clawql-repo-root.js";
import { indexAndMergeRoots, withDogfoodStorage } from "../test-utils/dogfood-graph.js";
import type { CodeGraphDocument } from "../types.js";

const repoRoot = resolveClawqlRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

describe("dogfood: ClawQL codebase index + queries", () => {
  let doc: CodeGraphDocument;
  const indexRoots = dogfoodIndexRoots(repoRoot);
  const maxFiles = dogfoodMaxFiles();

  beforeAll(async () => {
    delete process.env.CLAWQL_CODEGRAPH_BACKEND;
    doc = await indexAndMergeRoots({
      roots: indexRoots,
      graphId: "clawql-dogfood",
      maxFilesPerRoot: maxFiles,
    });
  }, 120_000);

  it("indexes a meaningful slice of the repo", () => {
    expect(doc.nodeCount).toBeGreaterThan(50);
    expect(doc.edgeCount).toBeGreaterThan(20);
    const fileNodes = Object.values(doc.nodes).filter((n) => n.kind === "file");
    expect(fileNodes.length).toBeGreaterThan(10);
  });

  it("finds codegraph engine symbols", () => {
    const hits = queryGraph(doc, "indexRepository", 5);
    expect(hits.some((h) => h.name === "indexRepository")).toBe(true);
    expect(hits.some((h) => h.filePath?.includes("index-repo.ts"))).toBe(true);
  });

  it("finds memory plugin symbols wired to codegraph", () => {
    const hits = queryGraph(doc, "createMemoryPlugin", 5);
    expect(hits.some((h) => h.name === "createMemoryPlugin")).toBe(true);
    expect(hits.some((h) => h.filePath?.includes("memory-plugin"))).toBe(true);
  });

  it("finds hybrid recall bridge", () => {
    const hits = queryGraph(doc, "recallCodeGraphSupplement", 5);
    expect(hits.some((h) => h.name === "recallCodeGraphSupplement")).toBe(true);
  });

  it("explains a known symbol neighborhood", () => {
    const explained = explainNode(doc, "queryGraph");
    expect(explained).not.toBeNull();
    expect(explained?.node.name).toBe("queryGraph");
    expect(explained?.summary).toContain("queryGraph");
  });

  it("returns a subgraph for an architecture concept", () => {
    const sg = subgraph(doc, "codegraph", 2, 30);
    expect(sg.nodes.length).toBeGreaterThan(0);
    expect(sg.seeds.length).toBeGreaterThan(0);
  });

  it("traces path within the memory tier when both endpoints exist", () => {
    const fromHits = queryGraph(doc, "createMemoryPlugin", 1);
    const toHits = queryGraph(doc, "handleMemoryRecallToolInput", 1);
    if (!fromHits[0] || !toHits[0]) return;
    const path = shortestPath(doc, fromHits[0].name, toHits[0].name);
    // Same-file symbols in memory-plugin.ts should connect via contains/file edges
    expect(path.found).toBe(true);
    expect(path.path.length).toBeGreaterThan(0);
  });
});

describe("dogfood: MCP handlers against indexed storage", () => {
  it("codegraph_index + codegraph_query round-trip on clawql-codegraph package", async () => {
    await withDogfoodStorage(async ({ storagePath, graphId }) => {
      const scope = defaultDogfoodScope(repoRoot);
      const indexResult = await codegraphIndex({
        rootPath: scope[0],
        graphId,
        maxFiles: 120,
        storagePath,
      });
      expect(indexResult.summary.nodeCount).toBeGreaterThan(20);

      const hits = await codegraphQuery({
        graphId,
        query: "importGraphifyJson",
        limit: 5,
        storagePath,
      });
      expect(hits.some((h) => h.name === "importGraphifyJson")).toBe(true);
    });
  }, 60_000);
});

describe("dogfood: known anchor files appear in the graph", () => {
  it("includes memory-plugin and index-repo source files", async () => {
    const doc = await indexAndMergeRoots({
      roots: defaultDogfoodScope(repoRoot),
      graphId: "clawql-dogfood-anchors",
      maxFilesPerRoot: dogfoodMaxFiles(),
    });
    const paths = Object.values(doc.nodes)
      .map((n) => n.filePath)
      .filter(Boolean);
    expect(paths.some((p) => p?.includes("memory-plugin.ts"))).toBe(true);
    expect(paths.some((p) => p?.includes("index-repo.ts"))).toBe(true);
  }, 90_000);
});

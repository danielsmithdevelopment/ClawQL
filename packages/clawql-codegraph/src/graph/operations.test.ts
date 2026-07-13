import { describe, expect, it } from "vitest";
import type { CodeGraphDocument } from "../types.js";
import { explainNode, queryGraph, shortestPath } from "./operations.js";

function sampleDoc(): CodeGraphDocument {
  const nodes = {
    "a::file": { id: "a::file", kind: "file" as const, name: "a.ts", filePath: "a.ts" },
    "a::function::auth": {
      id: "a::function::auth",
      kind: "function" as const,
      name: "authenticate",
      filePath: "a.ts",
    },
    "b::file": { id: "b::file", kind: "file" as const, name: "b.ts", filePath: "b.ts" },
    "b::function::db": {
      id: "b::function::db",
      kind: "function" as const,
      name: "DatabasePool",
      filePath: "b.ts",
    },
  };
  const edges = [
    { from: "a::function::auth", to: "b::function::db", kind: "calls" as const, confidence: "INFERRED" as const },
    { from: "a::file", to: "a::function::auth", kind: "contains" as const, confidence: "EXTRACTED" as const },
    { from: "b::file", to: "b::function::db", kind: "contains" as const, confidence: "EXTRACTED" as const },
  ];
  const adjacency: Record<string, string[]> = {
    "a::function::auth": ["b::function::db", "a::file"],
    "b::function::db": ["a::function::auth", "b::file"],
    "a::file": ["a::function::auth"],
    "b::file": ["b::function::db"],
  };
  return {
    graphId: "test",
    rootPath: "/tmp",
    builtAt: new Date().toISOString(),
    nodeCount: 4,
    edgeCount: 3,
    nodes,
    edges,
    adjacency,
  };
}

describe("graph operations", () => {
  it("queries symbols by name", () => {
    const hits = queryGraph(sampleDoc(), "authenticate");
    expect(hits[0]?.name).toBe("authenticate");
  });

  it("finds shortest path between concepts", () => {
    const path = shortestPath(sampleDoc(), "authenticate", "DatabasePool");
    expect(path.found).toBe(true);
    expect(path.path.length).toBeGreaterThan(1);
  });

  it("explains a node neighborhood", () => {
    const explain = explainNode(sampleDoc(), "authenticate");
    expect(explain?.node.name).toBe("authenticate");
    expect(explain?.summary).toContain("authenticate");
  });
});

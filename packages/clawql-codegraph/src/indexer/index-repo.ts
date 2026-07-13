import fs from "node:fs/promises";
import path from "node:path";
import type { CodeGraphDocument, CodeGraphEdge, CodeGraphNode } from "../types.js";
import { extractTypeScriptGraph } from "./extract-typescript.js";
import { relPath, walkCodeFiles } from "./walk-repo.js";

function buildAdjacency(edges: CodeGraphEdge[]): Record<string, string[]> {
  const adj: Record<string, string[]> = {};
  const add = (from: string, to: string): void => {
    if (!adj[from]) adj[from] = [];
    if (!adj[from].includes(to)) adj[from].push(to);
  };
  for (const e of edges) {
    add(e.from, e.to);
    add(e.to, e.from);
  }
  return adj;
}

export type IndexRepoOptions = {
  readonly graphId?: string;
  readonly rootPath: string;
  readonly maxFiles?: number;
};

export type IndexRepoResult = {
  readonly graphId: string;
  readonly rootPath: string;
  readonly filesIndexed: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly builtAt: string;
};

/** Walk a repository and build a structural code graph (TypeScript/JavaScript). */
export async function indexRepository(options: IndexRepoOptions): Promise<CodeGraphDocument> {
  const rootPath = path.resolve(options.rootPath);
  const graphId = options.graphId ?? defaultGraphId(rootPath);
  const files = await walkCodeFiles(rootPath, { maxFiles: options.maxFiles });

  const nodesMap = new Map<string, CodeGraphNode>();
  const edges: CodeGraphEdge[] = [];

  for (const absFile of files) {
    let content: string;
    try {
      content = await fs.readFile(absFile, "utf8");
    } catch {
      continue;
    }
    const rel = relPath(absFile, rootPath);
    const extracted = extractTypeScriptGraph(absFile, rel, content);
    for (const node of extracted.nodes) {
      nodesMap.set(node.id, node);
    }
    edges.push(...extracted.edges);
  }

  const nodes = Object.fromEntries(nodesMap);
  const builtAt = new Date().toISOString();
  return {
    graphId,
    rootPath,
    builtAt,
    nodeCount: Object.keys(nodes).length,
    edgeCount: edges.length,
    nodes,
    edges,
    adjacency: buildAdjacency(edges),
  };
}

function defaultGraphId(rootPath: string): string {
  const base = path.basename(rootPath) || "repo";
  return `${base}-codegraph`;
}

export function documentSummary(doc: CodeGraphDocument): IndexRepoResult {
  return {
    graphId: doc.graphId,
    rootPath: doc.rootPath,
    filesIndexed: Object.values(doc.nodes).filter((n) => n.kind === "file").length,
    nodeCount: doc.nodeCount,
    edgeCount: doc.edgeCount,
    builtAt: doc.builtAt,
  };
}

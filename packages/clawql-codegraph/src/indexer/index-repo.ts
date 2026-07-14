import fs from "node:fs/promises";
import path from "node:path";
import type { CodeGraphDocument, CodeGraphEdge, CodeGraphNode } from "../types.js";
import { codeGraphBackend } from "../config/backend.js";
import { loadGraphifyDocument } from "../bridge/graphify-delegate.js";
import { buildAdjacencyFromEdges } from "../import/graph-utils.js";
import { extractTypeScriptGraph } from "./extract-typescript.js";
import { extractWithTreeSitter } from "./extract-tree-sitter.js";
import { isCodeFile, relPath, walkCodeFiles } from "./walk-repo.js";

export { buildAdjacencyFromEdges };

function extLang(filePath: string): "typescript" | "python" | "go" | null {
  const ext = path.extname(filePath).toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "typescript";
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  return null;
}

async function extractFile(absFile: string, rel: string, content: string): Promise<{
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
}> {
  const lang = extLang(absFile);
  if (lang === "python" || lang === "go") {
    try {
      return await extractWithTreeSitter(lang, rel, content);
    } catch {
      return extractTypeScriptGraph(absFile, rel, content);
    }
  }
  return extractTypeScriptGraph(absFile, rel, content);
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

/** Walk a repository and build a structural code graph (TS/JS/Python/Go). */
export async function indexRepository(options: IndexRepoOptions): Promise<CodeGraphDocument> {
  if (codeGraphBackend() === "graphify") {
    return loadGraphifyDocument({ graphId: options.graphId, rootPath: options.rootPath });
  }

  const rootPath = path.resolve(options.rootPath);
  const graphId = options.graphId ?? defaultGraphId(rootPath);
  const files = await walkCodeFiles(rootPath, { maxFiles: options.maxFiles });

  const nodesMap = new Map<string, CodeGraphNode>();
  const edges: CodeGraphEdge[] = [];

  for (const absFile of files) {
    if (!isCodeFile(absFile)) continue;
    let content: string;
    try {
      content = await fs.readFile(absFile, "utf8");
    } catch {
      continue;
    }
    const rel = relPath(absFile, rootPath);
    const extracted = await extractFile(absFile, rel, content);
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
    adjacency: buildAdjacencyFromEdges(edges),
  };
}

export async function importGraphifyFromPath(options: {
  jsonPath: string;
  graphId?: string;
  rootPath?: string;
}): Promise<CodeGraphDocument> {
  return loadGraphifyDocument(options);
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

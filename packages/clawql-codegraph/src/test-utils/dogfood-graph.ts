import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CodeGraphDocument, CodeGraphEdge, CodeGraphNode } from "../types.js";
import { buildAdjacencyFromEdges } from "../import/graph-utils.js";
import { indexRepository } from "../indexer/index-repo.js";
import { FileCodeGraphStorage } from "../storage/file-storage.js";

function mergeNodes(into: Map<string, CodeGraphNode>, nodes: CodeGraphNode[]): void {
  for (const n of nodes) into.set(n.id, n);
}

function mergeEdges(into: CodeGraphEdge[], edges: CodeGraphEdge[]): void {
  into.push(...edges);
}

/**
 * Index one or more directories and merge into a single {@link CodeGraphDocument}.
 * Dogfood tests use this to index `clawql-codegraph` + `clawql-memory` without walking all of `node_modules`.
 */
export async function indexAndMergeRoots(options: {
  roots: readonly string[];
  graphId: string;
  maxFilesPerRoot?: number;
}): Promise<CodeGraphDocument> {
  const nodesMap = new Map<string, CodeGraphNode>();
  const edges: CodeGraphEdge[] = [];
  let filesIndexed = 0;

  for (const root of options.roots) {
    const doc = await indexRepository({
      rootPath: root,
      graphId: `${options.graphId}-${path.basename(root)}`,
      maxFiles: options.maxFilesPerRoot,
    });
    mergeNodes(nodesMap, Object.values(doc.nodes));
    mergeEdges(edges, doc.edges);
    filesIndexed += Object.values(doc.nodes).filter((n) => n.kind === "file").length;
  }

  const nodes = Object.fromEntries(nodesMap);
  return {
    graphId: options.graphId,
    rootPath: options.roots.join(":"),
    builtAt: new Date().toISOString(),
    nodeCount: Object.keys(nodes).length,
    edgeCount: edges.length,
    nodes,
    edges,
    adjacency: buildAdjacencyFromEdges(edges),
  };
}

export async function withDogfoodStorage<T>(
  fn: (ctx: { storagePath: string; storage: FileCodeGraphStorage; graphId: string }) => Promise<T>
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawql-codegraph-dogfood-"));
  const storagePath = path.join(dir, "codegraph.db.json");
  const graphId = `dogfood-${Date.now()}`;
  try {
    return await fn({
      storagePath,
      storage: new FileCodeGraphStorage(storagePath),
      graphId,
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

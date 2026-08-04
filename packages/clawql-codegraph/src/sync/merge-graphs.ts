import type { CodeGraphDocument, CodeGraphEdge, CodeGraphNode } from "../types.js";
import { buildAdjacencyFromEdges } from "../import/graph-utils.js";

/** Merge `extra` into `base`, preferring existing node ids from `base`. */
export function mergeCodeGraphs(
  base: CodeGraphDocument,
  extra: CodeGraphDocument,
  options: { graphId?: string; rootPath?: string } = {}
): CodeGraphDocument {
  const nodes: Record<string, CodeGraphNode> = { ...base.nodes };
  for (const [id, node] of Object.entries(extra.nodes)) {
    if (!nodes[id]) nodes[id] = node;
  }

  const edgeKey = (e: CodeGraphEdge) => `${e.from}|${e.to}|${e.kind}|${e.confidence}`;
  const seen = new Set(base.edges.map(edgeKey));
  const edges: CodeGraphEdge[] = [...base.edges];
  for (const e of extra.edges) {
    const k = edgeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push(e);
  }

  return {
    graphId: options.graphId ?? base.graphId,
    rootPath: options.rootPath ?? base.rootPath,
    builtAt: new Date().toISOString(),
    nodeCount: Object.keys(nodes).length,
    edgeCount: edges.length,
    nodes,
    edges,
    adjacency: buildAdjacencyFromEdges(edges),
  };
}

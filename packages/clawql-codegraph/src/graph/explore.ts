import type {
  CodeGraphDocument,
  CodeGraphExplainResult,
  CodeGraphNeighbor,
  CodeGraphNode,
  CodeGraphQueryHit,
} from "../types.js";
import { explainNode, getNeighbors, queryGraph, subgraph } from "./operations.js";

export type CodeGraphImpactHit = {
  readonly nodeId: string;
  readonly name: string;
  readonly kind: CodeGraphNode["kind"];
  readonly filePath?: string;
  readonly distance: number;
  readonly viaEdgeKind?: string;
};

export type CodeGraphImpactResult = {
  readonly seedQuery: string;
  readonly seedNodeId?: string;
  readonly depth: number;
  readonly impacted: CodeGraphImpactHit[];
  readonly files: string[];
};

export type CodeGraphExploreResult = {
  readonly query: string;
  readonly primary: CodeGraphExplainResult | null;
  readonly hits: CodeGraphQueryHit[];
  readonly neighbors: CodeGraphNeighbor[];
  readonly impact: CodeGraphImpactResult;
  readonly neighborhood: {
    readonly nodes: CodeGraphNode[];
    readonly edgeCount: number;
  };
  readonly guidance: string[];
};

/**
 * Reverse BFS: who depends on / calls / imports this symbol (blast radius).
 */
export function impactAnalysis(
  doc: CodeGraphDocument,
  seedQuery: string,
  depth = 2,
  limit = 80
): CodeGraphImpactResult {
  const seed = queryGraph(doc, seedQuery, 1)[0];
  if (!seed) {
    return { seedQuery, depth, impacted: [], files: [] };
  }

  const inboundAdj = new Map<string, { from: string; kind: string }[]>();
  for (const e of doc.edges) {
    const list = inboundAdj.get(e.to) ?? [];
    list.push({ from: e.from, kind: e.kind });
    inboundAdj.set(e.to, list);
  }

  const impacted: CodeGraphImpactHit[] = [];
  const visited = new Set<string>([seed.nodeId]);
  const queue: { id: string; distance: number; via?: string }[] = [
    { id: seed.nodeId, distance: 0 },
  ];

  while (queue.length > 0 && impacted.length < limit) {
    const { id, distance, via } = queue.shift()!;
    if (distance > 0) {
      const node = doc.nodes[id];
      if (node) {
        impacted.push({
          nodeId: id,
          name: node.name,
          kind: node.kind,
          filePath: node.filePath,
          distance,
          viaEdgeKind: via,
        });
      }
    }
    if (distance >= depth) continue;
    for (const { from, kind } of inboundAdj.get(id) ?? []) {
      if (visited.has(from)) continue;
      visited.add(from);
      queue.push({ id: from, distance: distance + 1, via: kind });
    }
  }

  const files = [
    ...new Set(impacted.map((h) => h.filePath).filter((f): f is string => Boolean(f))),
  ].sort();

  return {
    seedQuery,
    seedNodeId: seed.nodeId,
    depth,
    impacted,
    files,
  };
}

/**
 * Single-call agent context: explain + neighbors + blast radius + local subgraph.
 * Designed to cut multi-hop exploratory tool use on TypeScript codebases.
 */
export function exploreGraph(
  doc: CodeGraphDocument,
  query: string,
  options: { impactDepth?: number; neighborLimit?: number; subgraphDepth?: number } = {}
): CodeGraphExploreResult {
  const hits = queryGraph(doc, query, 8);
  const primary = explainNode(doc, query);
  const neighbors = primary
    ? getNeighbors(doc, primary.nodeId, { limit: options.neighborLimit ?? 40 })
    : [];
  const impact = impactAnalysis(doc, query, options.impactDepth ?? 2, 80);
  const neighborhood = subgraph(doc, query, options.subgraphDepth ?? 2, 50);

  const guidance: string[] = [];
  if (!primary) {
    guidance.push("No symbol match — try a more specific name or path fragment.");
  } else {
    guidance.push(
      `Primary: ${primary.node.kind} ${primary.node.name}` +
        (primary.node.filePath ? ` @ ${primary.node.filePath}` : "")
    );
    if (primary.node.tags?.length) {
      guidance.push(`Tags: ${primary.node.tags.join(", ")}`);
    }
    if (impact.impacted.length) {
      guidance.push(
        `Blast radius: ${impact.impacted.length} upstream nodes across ${impact.files.length} files (depth ${impact.depth}).`
      );
    }
    const callsOut = neighbors.filter((n) => n.edgeKind === "calls" && n.direction === "out");
    if (callsOut.length) {
      guidance.push(`Calls: ${callsOut.slice(0, 8).map((n) => n.name).join(", ")}`);
    }
  }

  return {
    query,
    primary,
    hits,
    neighbors,
    impact,
    neighborhood: {
      nodes: neighborhood.nodes,
      edgeCount: neighborhood.edges.length,
    },
    guidance,
  };
}

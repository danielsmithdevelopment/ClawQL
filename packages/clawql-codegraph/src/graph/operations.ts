import type {
  CodeGraphDocument,
  CodeGraphExplainResult,
  CodeGraphNeighbor,
  CodeGraphNode,
  CodeGraphPathResult,
  CodeGraphQueryHit,
} from "../types.js";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function scoreNode(node: CodeGraphNode, query: string): number {
  const terms = tokenize(query);
  const hay = `${node.name} ${node.filePath ?? ""} ${node.docComment ?? ""} ${(node.tags ?? []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (node.name.toLowerCase() === t) score += 10;
    else if (node.name.toLowerCase().includes(t)) score += 5;
    else if (hay.includes(t)) score += 1;
  }
  if (score <= 0) return 0;
  // Prefer concrete definitions over import aliases / stubs
  if (node.tags?.includes("import-binding")) score -= 4;
  if (node.tags?.includes("unresolved")) score -= 6;
  if (node.tags?.includes("exported")) score += 3;
  if (node.kind === "function" || node.kind === "class" || node.kind === "method") score += 2;
  if (node.kind === "file" || node.kind === "module") score -= 1;
  return score;
}

export function queryGraph(
  doc: CodeGraphDocument,
  query: string,
  limit = 20
): CodeGraphQueryHit[] {
  const hits: CodeGraphQueryHit[] = [];
  for (const node of Object.values(doc.nodes)) {
    if (node.kind === "file" && !query.includes("/")) continue;
    const score = scoreNode(node, query);
    if (score <= 0) continue;
    hits.push({
      nodeId: node.id,
      name: node.name,
      kind: node.kind,
      filePath: node.filePath,
      score,
      snippet: node.docComment?.slice(0, 240) ?? node.signature,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

export function getNeighbors(
  doc: CodeGraphDocument,
  nodeId: string,
  options: { edgeKinds?: string[]; limit?: number } = {}
): CodeGraphNeighbor[] {
  const limit = options.limit ?? 50;
  const kinds = options.edgeKinds ? new Set(options.edgeKinds) : null;
  const out: CodeGraphNeighbor[] = [];

  for (const edge of doc.edges) {
    if (kinds && !kinds.has(edge.kind)) continue;
    if (edge.from === nodeId) {
      const node = doc.nodes[edge.to];
      if (!node) continue;
      out.push({
        nodeId: edge.to,
        name: node.name,
        kind: node.kind,
        edgeKind: edge.kind,
        confidence: edge.confidence,
        direction: "out",
      });
    } else if (edge.to === nodeId) {
      const node = doc.nodes[edge.from];
      if (!node) continue;
      out.push({
        nodeId: edge.from,
        name: node.name,
        kind: node.kind,
        edgeKind: edge.kind,
        confidence: edge.confidence,
        direction: "in",
      });
    }
  }

  return out.slice(0, limit);
}

export function shortestPath(doc: CodeGraphDocument, fromQuery: string, toQuery: string): CodeGraphPathResult {
  const fromHit = queryGraph(doc, fromQuery, 1)[0];
  const toHit = queryGraph(doc, toQuery, 1)[0];
  if (!fromHit || !toHit) {
    return { found: false, from: fromQuery, to: toQuery, path: [], hops: 0 };
  }

  const start = fromHit.nodeId;
  const goal = toHit.nodeId;
  if (start === goal) {
    return { found: true, from: fromHit.name, to: toHit.name, path: [start], hops: 0 };
  }

  const queue: string[] = [start];
  const prev = new Map<string, string | null>([[start, null]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = doc.adjacency[current] ?? [];
    for (const next of neighbors) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      if (next === goal) {
        const path: string[] = [];
        let cursor: string | null = goal;
        while (cursor) {
          path.unshift(cursor);
          cursor = prev.get(cursor) ?? null;
        }
        return {
          found: true,
          from: fromHit.name,
          to: toHit.name,
          path,
          hops: path.length - 1,
        };
      }
      queue.push(next);
    }
  }

  return { found: false, from: fromHit.name, to: toHit.name, path: [], hops: 0 };
}

export function explainNode(doc: CodeGraphDocument, nodeQuery: string): CodeGraphExplainResult | null {
  const hit = queryGraph(doc, nodeQuery, 1)[0];
  if (!hit) return null;
  const node = doc.nodes[hit.nodeId];
  if (!node) return null;
  const inbound = getNeighbors(doc, hit.nodeId).filter((n) => n.direction === "in");
  const outbound = getNeighbors(doc, hit.nodeId).filter((n) => n.direction === "out");
  const summary = [
    `${node.kind} ${node.name}`,
    node.filePath ? `in ${node.filePath}` : undefined,
    node.docComment ? `— ${node.docComment.slice(0, 200)}` : undefined,
    `${inbound.length} inbound / ${outbound.length} outbound edges`,
  ]
    .filter(Boolean)
    .join(" ");
  return { nodeId: hit.nodeId, node, inbound, outbound, summary };
}

export function subgraph(
  doc: CodeGraphDocument,
  seedQuery: string,
  maxDepth = 2,
  maxNodes = 40
): { seeds: CodeGraphQueryHit[]; nodes: CodeGraphNode[]; edges: typeof doc.edges } {
  const seeds = queryGraph(doc, seedQuery, 5);
  const visited = new Set<string>();
  const queue: { id: string; depth: number }[] = seeds.map((s) => ({ id: s.nodeId, depth: 0 }));

  while (queue.length > 0 && visited.size < maxNodes) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (depth >= maxDepth) continue;
    for (const next of doc.adjacency[id] ?? []) {
      if (!visited.has(next)) queue.push({ id: next, depth: depth + 1 });
    }
  }

  const nodes = [...visited].map((id) => doc.nodes[id]).filter(Boolean);
  const edges = doc.edges.filter((e) => visited.has(e.from) && visited.has(e.to));
  return { seeds, nodes, edges };
}

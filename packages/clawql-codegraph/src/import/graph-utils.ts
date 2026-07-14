import type { CodeGraphEdge } from "../types.js";

export function buildAdjacencyFromEdges(edges: CodeGraphEdge[]): Record<string, string[]> {
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

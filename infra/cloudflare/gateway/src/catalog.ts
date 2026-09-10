/**
 * Edge-native operation catalog for search / execute.
 * Full OpenAPI provider catalogs stay on Node MCP; Developer/Teams edge
 * exposes vault + cache + audit + tenant ops with unlimited executions
 * (no Worker-side execution meter).
 */

export type EdgeOperation = {
  operationId: string;
  summary: string;
  tags: string[];
};

export const EDGE_OPERATIONS: EdgeOperation[] = [
  {
    operationId: "memory.ingest",
    summary: "Ingest markdown into the tenant R2 vault",
    tags: ["memory", "vault"],
  },
  {
    operationId: "memory.recall",
    summary: "Keyword recall from the tenant R2 vault",
    tags: ["memory", "vault"],
  },
  {
    operationId: "cache.get",
    summary: "Layer 5 KV semantic cache get",
    tags: ["cache", "layer5"],
  },
  {
    operationId: "cache.set",
    summary: "Layer 5 KV semantic cache set",
    tags: ["cache", "layer5"],
  },
  {
    operationId: "audit.append",
    summary: "Append a D1 audit row (tenant_id + correlation_id)",
    tags: ["audit"],
  },
  {
    operationId: "audit.list",
    summary: "List recent audit events for the tenant",
    tags: ["audit"],
  },
  {
    operationId: "tenant.get",
    summary: "Return the authenticated tenant metadata",
    tags: ["tenant"],
  },
];

export function searchEdgeOperations(query: string, limit = 10): EdgeOperation[] {
  const q = query.trim().toLowerCase();
  const lim = Math.min(Math.max(limit, 1), 50);
  if (!q) return EDGE_OPERATIONS.slice(0, lim);
  const scored = EDGE_OPERATIONS.map((op) => {
    const hay = `${op.operationId} ${op.summary} ${op.tags.join(" ")}`.toLowerCase();
    const score = q.split(/\s+/).filter((t) => hay.includes(t)).length;
    return { op, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, lim).map((x) => x.op);
}

export function findEdgeOperation(operationId: string): EdgeOperation | undefined {
  return EDGE_OPERATIONS.find((op) => op.operationId === operationId);
}

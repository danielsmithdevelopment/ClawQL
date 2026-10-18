/**
 * Workers-safe slim Core catalog for CoreToolsDO.
 *
 * Honesty: this is NOT full clawql-api (no node:fs vault, mandates, gRPC, WebMCP).
 * It is enough to prove search→execute for the equal-arm pets op + Streams noop
 * entirely inside a celld isolate.
 */

/** @typedef {{ operationId: string, summary: string, method?: string, path?: string, tags?: string[] }} CoreOp */

/** @type {readonly CoreOp[]} */
export const CORE_SLIM_CATALOG = Object.freeze([
  {
    operationId: "listPets",
    summary: "List pets (equal-arm OpenAPI board op)",
    method: "GET",
    path: "/pets",
    tags: ["pets", "openapi", "equal-arm"],
  },
  {
    operationId: "streams.session.noop",
    summary: "Lab noop for celld AgentSessionDO smoke",
    tags: ["streams", "celld", "noop"],
  },
]);

export const CORE_IN_CELLD_HONESTY =
  "CoreToolsDO: Workers-safe slim catalog + fetch execute inside celld isolate. Not full clawql-api (no vault/mandates/gRPC). transport=celld-isolate.";

/**
 * Keyword search over the slim catalog.
 * @param {string} query
 * @param {number} [limit]
 * @param {readonly CoreOp[]} [catalog]
 */
export function searchSlimCatalog(query, limit = 5, catalog = CORE_SLIM_CATALOG) {
  const q = String(query || "")
    .toLowerCase()
    .trim();
  const tokens = q ? q.split(/[^a-z0-9_.-]+/).filter(Boolean) : [];
  const scored = catalog.map((op) => {
    const hay = [op.operationId, op.summary, ...(op.tags ?? []), op.path ?? "", op.method ?? ""]
      .join(" ")
      .toLowerCase();
    let score = 0;
    if (!tokens.length) score = 0.1;
    for (const t of tokens) {
      if (op.operationId.toLowerCase() === t) score += 10;
      else if (op.operationId.toLowerCase().includes(t)) score += 5;
      else if (hay.includes(t)) score += 2;
    }
    return { op, score };
  });
  scored.sort((a, b) => b.score - a.score || a.op.operationId.localeCompare(b.op.operationId));
  const results = scored
    .filter((s) => s.score > 0)
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map((s) => ({
      operationId: s.op.operationId,
      score: s.score,
      summary: s.op.summary,
      method: s.op.method,
      path: s.op.path,
      tags: s.op.tags ?? [],
    }));
  return {
    ok: true,
    source: "core-tools-do",
    transport: "celld-isolate",
    host: "CoreToolsDO",
    honesty: CORE_IN_CELLD_HONESTY,
    query,
    results,
  };
}

/**
 * Resolve execute plan for a slim op (network via fetch for REST paths).
 * @param {string} operationId
 * @param {Record<string, unknown>} [args]
 * @param {readonly CoreOp[]} [catalog]
 */
export function resolveSlimExecute(operationId, args = {}, catalog = CORE_SLIM_CATALOG) {
  const op = catalog.find((o) => o.operationId === operationId);
  if (!op) {
    return {
      ok: false,
      error: `unknown operationId: ${operationId}`,
      operationId,
      transport: "celld-isolate",
      host: "CoreToolsDO",
      honesty: CORE_IN_CELLD_HONESTY,
    };
  }
  return {
    ok: true,
    op,
    args,
    transport: "celld-isolate",
    host: "CoreToolsDO",
    honesty: CORE_IN_CELLD_HONESTY,
  };
}

import type { ATRScope } from "../../shared/types.js";

export type OpenHandsAtrTemplateName = "bounded_engineer" | "readonly_review" | "long_refactor";

export const OPENHANDS_ATR_TEMPLATES: Record<OpenHandsAtrTemplateName, ATRScope> = {
  bounded_engineer: {
    toolsInScope: [
      "memory_recall",
      "memory_ingest",
      "search",
      "execute",
      "audit",
      "cache",
      "data_query",
      "clawql_sql",
    ],
    toolsOutOfScope: ["sandbox_exec", "notify"],
    budget: { maxTokens: 500_000, maxUsd: 5.0, maxTurns: 100 },
    sessionTtl: 7200,
  },

  readonly_review: {
    toolsInScope: ["memory_recall", "search", "audit", "cache"],
    toolsOutOfScope: ["execute", "memory_ingest", "sandbox_exec"],
    budget: { maxTokens: 200_000, maxUsd: 2.0, maxTurns: 40 },
    sessionTtl: 3600,
  },

  long_refactor: {
    toolsInScope: [
      "memory_recall",
      "memory_ingest",
      "search",
      "execute",
      "audit",
      "cache",
      "web_search",
      "data_query",
      "clawql_sql",
    ],
    toolsOutOfScope: ["sandbox_exec"],
    budget: { maxTokens: 2_000_000, maxUsd: 20.0, maxTurns: 200 },
    sessionTtl: 14_400,
  },
};

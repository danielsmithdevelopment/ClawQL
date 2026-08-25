import type { ATRScope } from "../../shared/types.js";

export type HermesAtrTemplateName = "orchestrator" | "readonly_recall" | "full_ops";

/** Shippable Hermes ATR templates (personal-agent orchestration scopes). */
export const HERMES_ATR_TEMPLATES: Record<HermesAtrTemplateName, ATRScope> = {
  orchestrator: {
    toolsInScope: [
      "memory_recall",
      "memory_ingest",
      "clawql_sql",
      "data_query",
      "web_search",
      "search",
      "execute",
      "audit",
    ],
    toolsOutOfScope: ["sandbox_exec"],
    budget: { maxTokens: 500_000, maxUsd: 5.0, maxTurns: 60 },
    sessionTtl: 7200,
  },

  readonly_recall: {
    toolsInScope: ["memory_recall", "search", "audit", "cache", "web_search"],
    toolsOutOfScope: ["execute", "memory_ingest", "sandbox_exec", "notify"],
    budget: { maxTokens: 200_000, maxUsd: 2.0, maxTurns: 30 },
    sessionTtl: 3600,
  },

  full_ops: {
    toolsInScope: [
      "memory_recall",
      "memory_ingest",
      "clawql_sql",
      "data_query",
      "web_search",
      "search",
      "execute",
      "audit",
      "cache",
      "schedule",
      "notify",
    ],
    toolsOutOfScope: ["sandbox_exec"],
    budget: { maxTokens: 1_000_000, maxUsd: 10.0, maxTurns: 100 },
    sessionTtl: 7200,
  },
};

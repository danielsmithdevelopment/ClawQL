import type { ATRScope } from "../../shared/types.js";

export type ClineAtrTemplateName =
  | "execution_worker"
  | "readonly_recall"
  | "sql_plus_memory";

/**
 * Shippable ATR templates for Cline (real MCP tool names only).
 * Host file/terminal remain Cline-native — cover with WORM hooks, not ATR tools.
 */
export const CLINE_ATR_TEMPLATES: Record<ClineAtrTemplateName, ATRScope> = {
  /** Personal-agent Cline worker — execute + recall, no sandbox. */
  execution_worker: {
    toolsInScope: ["clawql_sql", "data_query", "memory_recall", "search", "execute", "audit"],
    toolsOutOfScope: ["sandbox_exec", "memory_ingest", "notify", "schedule"],
    budget: { maxTokens: 200_000, maxUsd: 2.0, maxTurns: 40 },
    sessionTtl: 3600,
  },

  readonly_recall: {
    toolsInScope: ["memory_recall", "search", "audit", "cache"],
    toolsOutOfScope: ["execute", "memory_ingest", "sandbox_exec", "notify", "schedule"],
    budget: { maxTokens: 100_000, maxUsd: 1.0, maxTurns: 20 },
    sessionTtl: 1800,
  },

  sql_plus_memory: {
    toolsInScope: [
      "clawql_sql",
      "data_query",
      "memory_recall",
      "memory_ingest",
      "search",
      "execute",
      "audit",
      "cache",
    ],
    toolsOutOfScope: ["sandbox_exec"],
    budget: { maxTokens: 300_000, maxUsd: 3.0, maxTurns: 50 },
    sessionTtl: 3600,
  },
};

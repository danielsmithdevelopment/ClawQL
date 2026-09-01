import type { ATRScope } from "../../shared/types.js";

export type GooseAtrTemplateName = "scoped_coder" | "readonly_explorer" | "repo_automator";

/** Goose ATR — path-scoped coding; MCP tools + allowedPaths for FS wraps. */
export type GooseAtrScope = ATRScope & {
  readonly allowedPaths: readonly string[];
};

export const GOOSE_ATR_TEMPLATES: Record<GooseAtrTemplateName, GooseAtrScope> = {
  scoped_coder: {
    toolsInScope: [
      "memory_recall",
      "search",
      "execute",
      "audit",
      "cache",
      "data_query",
      "clawql_sql",
    ],
    toolsOutOfScope: ["sandbox_exec", "notify", "schedule"],
    budget: { maxTokens: 400_000, maxUsd: 4.0, maxTurns: 80 },
    sessionTtl: 7200,
    allowedPaths: ["/workspace", "/tmp/goose"],
  },

  readonly_explorer: {
    toolsInScope: ["memory_recall", "search", "audit", "cache"],
    toolsOutOfScope: ["execute", "memory_ingest", "sandbox_exec"],
    budget: { maxTokens: 150_000, maxUsd: 1.5, maxTurns: 30 },
    sessionTtl: 3600,
    allowedPaths: ["/workspace"],
  },

  repo_automator: {
    toolsInScope: [
      "memory_recall",
      "memory_ingest",
      "search",
      "execute",
      "audit",
      "cache",
      "data_query",
      "clawql_sql",
      "web_search",
    ],
    toolsOutOfScope: ["sandbox_exec"],
    budget: { maxTokens: 800_000, maxUsd: 8.0, maxTurns: 120 },
    sessionTtl: 10_800,
    allowedPaths: ["/workspace", "/tmp/goose"],
  },
};

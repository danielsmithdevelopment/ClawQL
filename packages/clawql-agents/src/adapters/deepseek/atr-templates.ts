import type { ATRScope } from "../../shared/types.js";

export type DeepSeekAtrTemplateName = "plugin_locked" | "readonly_tools";

export type DeepSeekAtrScope = ATRScope & {
  readonly allowedPlugins: readonly string[];
};

export const DEEPSEEK_ATR_TEMPLATES: Record<DeepSeekAtrTemplateName, DeepSeekAtrScope> = {
  plugin_locked: {
    toolsInScope: [
      "memory_recall",
      "search",
      "execute",
      "audit",
      "cache",
      "data_query",
      "clawql_sql",
    ],
    toolsOutOfScope: ["sandbox_exec", "notify"],
    budget: { maxTokens: 400_000, maxUsd: 4.0, maxTurns: 60 },
    sessionTtl: 7200,
    allowedPlugins: ["core", "clawql-mcp", "filesystem-readonly"],
  },

  readonly_tools: {
    toolsInScope: ["memory_recall", "search", "audit", "cache"],
    toolsOutOfScope: ["execute", "memory_ingest", "sandbox_exec"],
    budget: { maxTokens: 150_000, maxUsd: 1.5, maxTurns: 30 },
    sessionTtl: 3600,
    allowedPlugins: ["core", "clawql-mcp"],
  },
};

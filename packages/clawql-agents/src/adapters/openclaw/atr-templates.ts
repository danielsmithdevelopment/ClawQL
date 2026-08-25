import type { ATRScope } from "../../shared/types.js";

export type OpenClawAtrTemplateName =
  | "readonly_assistant"
  | "drafting_assistant"
  | "full_automation";

/**
 * Shippable OpenClaw ATR templates — real MCP tools only (no Family S email stubs).
 */
export const OPENCLAW_ATR_TEMPLATES: Record<OpenClawAtrTemplateName, ATRScope> = {
  readonly_assistant: {
    toolsInScope: ["memory_recall", "web_search", "search", "audit", "cache"],
    toolsOutOfScope: ["execute", "memory_ingest", "sandbox_exec", "notify", "schedule"],
    budget: { maxTokens: 500_000, maxUsd: 5.0, maxTurns: 50 },
    sessionTtl: 3600,
  },

  drafting_assistant: {
    toolsInScope: [
      "memory_recall",
      "memory_ingest",
      "web_search",
      "search",
      "execute",
      "audit",
      "cache",
    ],
    toolsOutOfScope: ["sandbox_exec", "notify"],
    budget: { maxTokens: 300_000, maxUsd: 3.0, maxTurns: 30 },
    sessionTtl: 1800,
  },

  full_automation: {
    toolsInScope: [
      "memory_recall",
      "memory_ingest",
      "web_search",
      "search",
      "execute",
      "audit",
      "cache",
      "data_query",
      "clawql_sql",
      "schedule",
      "notify",
    ],
    toolsOutOfScope: ["sandbox_exec"],
    budget: { maxTokens: 1_000_000, maxUsd: 10.0, maxTurns: 100 },
    sessionTtl: 7200,
  },
};

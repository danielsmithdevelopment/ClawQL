import type { ATRScope } from "../../shared/types.js";

export type PiAtrTemplateName = "conversational_memory" | "readonly_prefs";

/** Pi API-layer ATR — memory_recall/ingest carry cross-session continuity. */
export const PI_ATR_TEMPLATES: Record<PiAtrTemplateName, ATRScope> = {
  conversational_memory: {
    toolsInScope: ["memory_recall", "memory_ingest", "web_search", "search", "audit", "cache"],
    toolsOutOfScope: ["execute", "sandbox_exec", "notify"],
    budget: { maxTokens: 300_000, maxUsd: 3.0, maxTurns: 40 },
    sessionTtl: 3600,
  },

  readonly_prefs: {
    toolsInScope: ["memory_recall", "search", "audit", "cache"],
    toolsOutOfScope: ["execute", "memory_ingest", "sandbox_exec"],
    budget: { maxTokens: 100_000, maxUsd: 1.0, maxTurns: 20 },
    sessionTtl: 1800,
  },
};

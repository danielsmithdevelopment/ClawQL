/**
 * Map MCP tool names to ATR scope families (audit Pass 2 S3 / T3).
 * Virtual keys carry execute/search/memory; a narrow `core` allowlist covers
 * session utilities every non-empty scope may use.
 */

export type AtrToolScopeDecision =
  { readonly allow: true } | { readonly allow: false; readonly reason: string };

/** Explicit always-allowed core tools (audit T3 — not every read/passthrough). */
const CORE_TOOL_NAMES = new Set(["cache", "docs_search", "audit", "resume", "console_link"]);

/**
 * Resolve the ATR family for a tool name.
 * - execute / proxy_call → execute
 * - search → search
 * - memory_* → memory
 * - data_* → data
 * - document tools → documents
 * - web_* → web
 * - narrow core allowlist → core
 * - otherwise the tool name itself
 */
export function atrScopeFamilyForTool(toolName: string): string {
  if (toolName === "execute" || toolName.startsWith("execute_") || toolName === "proxy_call") {
    return "execute";
  }
  if (toolName === "search" || toolName.startsWith("search_")) {
    return "search";
  }
  if (toolName.startsWith("memory_")) {
    return "memory";
  }
  if (toolName.startsWith("data_") || toolName === "clawql_sql") {
    return "data";
  }
  if (
    toolName.startsWith("inspect_") ||
    toolName.startsWith("extract_") ||
    toolName.startsWith("convert_") ||
    toolName.startsWith("classify_") ||
    toolName.startsWith("langextract") ||
    toolName === "ingest_external_knowledge"
  ) {
    return "documents";
  }
  if (toolName.startsWith("web_")) {
    return "web";
  }
  if (CORE_TOOL_NAMES.has(toolName) || toolName.startsWith("skills_")) {
    return "core";
  }
  return toolName;
}

/**
 * @param tokens - undefined = no ATR context (stdio / unscoped host) → allow;
 *   [] = authenticated with empty scope → deny;
 *   includes `*` → allow all;
 *   otherwise family / tool name / implicit `core` for any non-empty scope.
 */
export function decideAtrToolScope(
  toolName: string,
  tokens: readonly string[] | undefined
): AtrToolScopeDecision {
  if (tokens === undefined) return { allow: true };
  if (tokens.includes("*")) return { allow: true };
  if (tokens.length === 0) {
    return {
      allow: false,
      reason: `Tool "${toolName}" refused: authenticated session has empty ATR scope`,
    };
  }
  const family = atrScopeFamilyForTool(toolName);
  if (tokens.includes(family) || tokens.includes(toolName)) return { allow: true };
  if (family === "core") return { allow: true };
  return {
    allow: false,
    reason: `Tool "${toolName}" is outside session ATR scope [${tokens.join(", ")}]`,
  };
}

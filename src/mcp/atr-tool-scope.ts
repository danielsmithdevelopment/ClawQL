/**
 * Map MCP tool names to ATR scope families (audit Pass 2 S3).
 * Virtual keys carry execute/search/memory; passthrough/read natives map to `core`
 * so every non-empty session can still use cache, skills_*, audit, resume, etc.
 */

import { NATIVE_TOOL_POLICY } from "clawql-api";

export type AtrToolScopeDecision =
  { readonly allow: true } | { readonly allow: false; readonly reason: string };

/**
 * Resolve the ATR family for a tool name.
 * - execute / proxy_call → execute
 * - search → search
 * - memory_* → memory
 * - passthrough/read natives → core
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
  if (toolName === "resume") {
    return "core";
  }
  const policy = NATIVE_TOOL_POLICY[toolName];
  if (policy && (policy.kind === "passthrough" || policy.kind === "read")) {
    return "core";
  }
  if (
    toolName.startsWith("skills_") ||
    toolName === "docs_search" ||
    toolName.startsWith("audit")
  ) {
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

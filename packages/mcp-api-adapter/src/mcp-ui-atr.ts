import type { ListedMcpTool } from "mcp-grpc-transport";
import type { VerifiedMcpAdapterAtr } from "./edge-auth.js";

/** Tool-name prefixes that must be explicitly granted (not via generic memory/search scopes). */
export const INTERNAL_TOOL_PREFIXES = ["ouroboros_", "pageindex_"] as const;

/** Capability scope → tool names (non-internal). */
const CAPABILITY_TOOLS: Record<string, readonly string[]> = {
  search: ["search"],
  execute: ["execute"],
  memory: ["memory_recall", "memory_ingest", "memory_sync"],
  audit: ["audit"],
  cache: ["cache"],
  ingest: ["ingest_external_knowledge"],
  /** Document tools visibility (separate from file-processing gate). */
  documents: [
    "run_idp_pipeline",
    "classify_document",
    "extract_document",
    "convert_document",
    "inspect_pdf",
  ],
  idp: [
    "run_idp_pipeline",
    "classify_document",
    "extract_document",
    "convert_document",
    "inspect_pdf",
  ],
};

/** Scopes that may trigger document/file processing (Batch 2 IDP gate). */
const DOCUMENT_PROCESSING_SCOPES = new Set(["documents", "idp", "*"]);

export function canProcessDocuments(atr: VerifiedMcpAdapterAtr): boolean {
  const role = atr.role?.trim().toLowerCase();
  if (role === "admin") return true;
  const scopes = scopesOf(atr);
  const tools = toolsOf(atr);
  if (scopes.includes("*") || tools.includes("*")) return true;
  if (scopes.some((s) => DOCUMENT_PROCESSING_SCOPES.has(s))) return true;
  // Explicit grant of an IDP tool implies processing for that operator
  if (
    tools.some((t) =>
      ["run_idp_pipeline", "convert_document", "inspect_pdf"].includes(t)
    ) ||
    scopes.some((t) =>
      ["run_idp_pipeline", "convert_document", "inspect_pdf"].includes(t)
    )
  ) {
    return true;
  }
  return false;
}

export function isInternalToolName(toolName: string): boolean {
  return INTERNAL_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}

function scopesOf(atr: VerifiedMcpAdapterAtr): string[] {
  return Array.isArray(atr.scope) ? atr.scope.map((s) => String(s).trim()).filter(Boolean) : [];
}

function toolsOf(atr: VerifiedMcpAdapterAtr): string[] {
  return Array.isArray(atr.tools) ? atr.tools.map((s) => String(s).trim()).filter(Boolean) : [];
}

/**
 * Whether a tool is visible/executable for this ATR.
 *
 * - `role: admin` or scope/tools `*` → all tools
 * - Exact tool name in `scope` or `tools` → that tool (including internal)
 * - Capability scopes (`search`, `memory`, …) → mapped public tools only
 * - Family scopes `pageindex` / `ouroboros` → matching internal prefixes
 * - Internal tools are never granted by generic capability scopes alone
 */
export function isToolAuthorizedForAtr(
  toolName: string,
  atr: VerifiedMcpAdapterAtr
): boolean {
  const role = atr.role?.trim().toLowerCase();
  if (role === "admin") return true;

  const scopes = scopesOf(atr);
  const tools = toolsOf(atr);
  if (scopes.includes("*") || tools.includes("*")) return true;

  if (scopes.includes(toolName) || tools.includes(toolName)) return true;

  if (isInternalToolName(toolName)) {
    if (toolName.startsWith("pageindex_") && scopes.includes("pageindex")) return true;
    if (toolName.startsWith("ouroboros_") && scopes.includes("ouroboros")) return true;
    return false;
  }

  for (const scope of scopes) {
    const mapped = CAPABILITY_TOOLS[scope];
    if (mapped?.includes(toolName)) return true;
  }

  return false;
}

/** Admin-equivalent ATR used for static API-key edge auth. */
export const API_KEY_ADMIN_ATR: VerifiedMcpAdapterAtr = {
  sub: "api-key",
  role: "admin",
  scope: ["*"],
};

export function filterToolsForAtr(
  tools: ListedMcpTool[],
  atr: VerifiedMcpAdapterAtr | undefined,
  atrScoped: boolean
): ListedMcpTool[] {
  if (!atrScoped || !atr) return tools;
  return tools.filter((tool) => isToolAuthorizedForAtr(tool.name, atr));
}

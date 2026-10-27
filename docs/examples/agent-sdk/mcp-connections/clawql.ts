/**
 * Agent SDK MCP connection → ClawQL.
 *
 * Copy to: bot/mcp-connections/clawql.ts
 *
 * Default: Streamable HTTP (cloud / Helm / clawql-mcp-http).
 * For local stdio, swap to the commented `command` block below.
 *
 * Prefer a narrow tools allowlist for token efficiency. Server-side ATR,
 * Panguard, and mandates still apply — this only limits what the model sees.
 *
 * Secrets use ${NAME} templates (resolved when the connection opens — do not
 * read process.env at module load for Cursor hosting).
 *
 * @see https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/integrations/cursor-agent-sdk.md
 */
import { defineConnection } from "@grok/agent-sdk/connections";

/** Core always-on ClawQL tools (narrow default). Extend as needed. */
const CLAWQL_CORE_TOOLS = ["search", "execute", "audit", "cache"] as const;

/** Common memory pair — add to `tools` when the bot should use the vault. */
export const CLAWQL_MEMORY_TOOLS = ["memory_recall", "memory_ingest"] as const;

export default defineConnection({
  // Streamable HTTP — set CLAWQL_MCP_URL (e.g. https://…/mcp or http://127.0.0.1:8080/mcp)
  url: "${CLAWQL_MCP_URL}",
  headers: {
    // Optional bearer / gateway token. Leave unset locally if the gateway is open.
    authorization: "Bearer ${CLAWQL_MCP_BEARER}",
  },
  advertiseTools: true,
  // Named subset: Core only. Drop this line (and keep advertiseTools) to list all.
  tools: [...CLAWQL_CORE_TOOLS],
  // Skip the connection when URL/auth is missing instead of failing every turn.
  optional: true,
  description:
    "ClawQL governed MCP (search/execute + audit). Mandates and Panguard apply server-side.",
});

/*
 * --- Local stdio alternative ---
 * Prefer HTTP when the gateway already runs. Stdio respawns per turn on many
 * hosts — fine for smoke tests, costly for large ClawQL boots.
 *
 * export default defineConnection({
 *   command: "${CLAWQL_MCP_COMMAND}", // e.g. node
 *   args: ["${CLAWQL_MCP_ENTRY}"],    // e.g. /path/to/ClawQL/bin/clawql-mcp.mjs
 *   env: {
 *     CLAWQL_HOME: "${CLAWQL_HOME}",
 *     // Optional feature flags — keep Core-only unless you need them:
 *     // CLAWQL_ENABLE_MEMORY: "1",
 *   },
 *   advertiseTools: true,
 *   tools: [...CLAWQL_CORE_TOOLS, ...CLAWQL_MEMORY_TOOLS],
 *   optional: true,
 *   description: "ClawQL MCP over stdio (local binary).",
 * });
 */

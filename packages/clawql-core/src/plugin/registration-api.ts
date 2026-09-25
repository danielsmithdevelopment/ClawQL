/**
 * Tool schema at the core boundary is opaque — `clawql-api` narrows to Zod at registration.
 */

import type { Effect } from "effect";
import type { ClawQLError, McpToolAlreadyRegisteredError } from "../errors/clawql-error.js";
import type { ToolRoutingHint } from "./routing-hint.js";

export type { DistinguishFromEntry, ToolRoutingHint } from "./routing-hint.js";

export type McpToolContent = { readonly type: "text"; readonly text: string };
export type McpToolResult = { readonly content: readonly McpToolContent[] };
export type McpToolHandler = (args: unknown) => Promise<McpToolResult>;

/**
 * Tool schema at the core boundary is opaque — `clawql-api` narrows to Zod at registration.
 * Routing hints compose via `ToolRoutingHint` intersection (single field source — do not re-list).
 */
export type McpToolDefinition = {
  readonly name: string;
  /** Human-readable tool purpose shown in MCP `tools/list` when present. */
  readonly description?: string;
  readonly schema: Record<string, unknown>;
  readonly handler: McpToolHandler;
  /**
   * Optional per-parameter usage notes beyond bare JSON Schema types
   * (improves hand-authored and synthesized eval quality — Agent Seer / spec §9.3).
   */
  readonly parameterNotes?: Record<string, string>;
} & ToolRoutingHint;

/** Passed to ProviderPlugin install so plugins can register MCP tools without importing transport. */
export interface ClawQLPluginRegistrationApi {
  registerMcpTool(
    tool: McpToolDefinition
  ): Effect.Effect<void, ClawQLError | McpToolAlreadyRegisteredError>;
}

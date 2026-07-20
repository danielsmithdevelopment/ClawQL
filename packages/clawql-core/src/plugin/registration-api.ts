import type { Effect } from "effect";
import type { ClawQLError, McpToolAlreadyRegisteredError } from "../errors/clawql-error.js";

export type McpToolContent = { readonly type: "text"; readonly text: string };
export type McpToolResult = { readonly content: readonly McpToolContent[] };
export type McpToolHandler = (args: unknown) => Promise<McpToolResult>;

/**
 * Tool schema at the core boundary is opaque — `clawql-api` narrows to Zod at registration.
 */
export type McpToolDefinition = {
  readonly name: string;
  /** Human-readable tool purpose shown in MCP `tools/list` when present. */
  readonly description?: string;
  readonly schema: Record<string, unknown>;
  readonly handler: McpToolHandler;
};

/** Passed to `Plugin.onRegister` so plugins can register MCP tools without importing transport. */
export interface ClawQLPluginRegistrationApi {
  registerMcpTool(
    tool: McpToolDefinition
  ): Effect.Effect<void, ClawQLError | McpToolAlreadyRegisteredError>;
}

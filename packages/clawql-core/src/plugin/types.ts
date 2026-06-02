import type { Effect } from "effect";
import type { ClawQLError } from "../errors/clawql-error.js";

export type PluginKind = "default" | "mcp-proxy";

export type McpProxyCallContext = {
  readonly toolName: string;
  readonly args: unknown;
};

/**
 * Vertical / horizontal extension contract (enablement §5.4).
 * `ClawQLApi` is provided at registration time — full hook surface grows in Phase 2+.
 */
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly vertical?: string;
  readonly kind?: PluginKind;

  onRegister?: () => Effect.Effect<void, ClawQLError>;
  onTeardown?: () => Effect.Effect<void, ClawQLError>;
  /** `mcp-proxy` plugins: run before MCP tool handlers (Panguard ATR, etc.). */
  beforeCallTool?: (ctx: McpProxyCallContext) => Effect.Effect<void, ClawQLError>;
}

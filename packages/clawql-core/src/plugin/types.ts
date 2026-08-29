import type { Effect } from "effect";
import type { ClawQLError, McpToolAlreadyRegisteredError } from "../errors/clawql-error.js";
import type { ClawQLPluginRegistrationApi } from "./registration-api.js";

export type PluginKind = "default" | "mcp-proxy";

export type McpProxyCallContext = {
  readonly toolName: string;
  readonly args: unknown;
};

/**
 * Vertical / horizontal extension contract (enablement §5.4).
 *
 * @deprecated ClawQL 8.0 — prefer {@link ProviderPlugin} from `./provider-types.js`.
 * Use `legacyPluginToProviderPlugin()` to bridge. `beforeCallTool` maps to
 * `tool` / `pre-execute` lifecycle hooks.
 * @see docs/design/clawql-core-plugin-architecture.md
 */
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly vertical?: string;
  readonly kind?: PluginKind;

  onRegister?: (
    api: ClawQLPluginRegistrationApi
  ) => Effect.Effect<void, ClawQLError | McpToolAlreadyRegisteredError>;
  onTeardown?: () => Effect.Effect<void, ClawQLError>;
  /** `mcp-proxy` plugins: run before MCP tool handlers (Panguard ATR, x402, etc.). */
  beforeCallTool?: (ctx: McpProxyCallContext) => Effect.Effect<void, ClawQLError | Error>;
}

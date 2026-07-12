import { Effect } from "effect";
import { isX402McpPaymentError } from "./mcp-errors.js";
import { runMcpX402BeforeCallTool, type RunMcpX402BeforeCallToolOptions } from "./mcp-enforce.js";

/**
 * Effect wrapper for in-process MCP x402 enforcement.
 * Preserves {@link X402McpPaymentRequiredError} / {@link X402McpPaymentDeniedError} for MCP tool results.
 */
export function mcpX402BeforeCallToolEffect(
  options: RunMcpX402BeforeCallToolOptions
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => runMcpX402BeforeCallTool(options),
    catch: (cause) =>
      isX402McpPaymentError(cause)
        ? cause
        : cause instanceof Error
          ? cause
          : new Error(String(cause)),
  });
}

import { isX402McpPaymentError } from "clawql-payments/x402";
import { runMcpProxyBeforeCallTool } from "./clawql-api-adapters.js";
import { wrapMcpToolHandler } from "./otel-tracing.js";

/**
 * Wrap MCP tool handlers with mcp-proxy pipeline hooks (Panguard, x402, …)
 * and OpenTelemetry spans.
 */
export function wrapRegisteredMcpToolHandler<TArgs extends unknown[], TResult>(
  toolName: string,
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return wrapMcpToolHandler(toolName, async (...args: TArgs): Promise<TResult> => {
    try {
      await runMcpProxyBeforeCallTool(toolName, args[0]);
    } catch (err: unknown) {
      if (isX402McpPaymentError(err)) {
        return err.toToolResult() as TResult;
      }
      throw err;
    }
    return handler(...args);
  });
}

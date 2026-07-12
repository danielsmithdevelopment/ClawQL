import {
  isX402McpPaymentError,
  runMcpX402BeforeCallTool,
} from "clawql-payments/x402";
import { wrapMcpToolHandler } from "./otel-tracing.js";

/**
 * Wrap MCP tool handlers with optional x402 enforcement (when `CLAWQL_X402_ENFORCE=1`)
 * and OpenTelemetry spans.
 */
export function wrapRegisteredMcpToolHandler<TArgs extends unknown[], TResult>(
  toolName: string,
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return wrapMcpToolHandler(toolName, async (...args: TArgs): Promise<TResult> => {
    try {
      await runMcpX402BeforeCallTool({ toolName });
    } catch (err: unknown) {
      if (isX402McpPaymentError(err)) {
        return err.toToolResult() as TResult;
      }
      throw err;
    }
    return handler(...args);
  });
}

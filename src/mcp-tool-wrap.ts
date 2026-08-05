import { isX402McpPaymentError } from "clawql-payments/x402";
import { isMppMcpJsonRpcPaymentError } from "clawql-payments/mpp";
import { runMcpProxyBeforeCallTool } from "./clawql-api-adapters.js";
import { wrapMcpToolHandler } from "./otel-tracing.js";

function clawqlPolicyBlockMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const rec = err as { _tag?: string; reason?: unknown; message?: unknown; cause?: unknown };
  if (typeof rec.reason === "string" && rec.reason.includes("Panguard policy blocked")) {
    return rec.reason;
  }
  if (typeof rec.message === "string" && rec.message.includes("Panguard policy blocked")) {
    return rec.message;
  }
  // Effect.runPromise often wraps TaggedError; walk one cause level.
  if (rec.cause) return clawqlPolicyBlockMessage(rec.cause);
  return null;
}

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
      if (isMppMcpJsonRpcPaymentError(err)) {
        return err.toToolResult() as TResult;
      }
      if (isX402McpPaymentError(err)) {
        return err.toToolResult() as TResult;
      }
      // Surface Panguard denials as MCP tool errors (OpenCode otherwise shows
      // a generic "An error has occurred" and loses the policy reason).
      const blocked = clawqlPolicyBlockMessage(err);
      if (blocked) {
        return {
          content: [{ type: "text" as const, text: blocked }],
          isError: true,
        } as TResult;
      }
      throw err;
    }
    return handler(...args);
  });
}

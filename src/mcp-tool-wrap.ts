import { isX402McpPaymentError } from "clawql-payments/x402";
import { isMppMcpJsonRpcPaymentError } from "clawql-payments/mpp";
import { runMcpProxyBeforeCallTool } from "./clawql-api-adapters.js";
import { recordMcpToolCallAudit, type McpToolAuditOutcome } from "./mcp-tool-audit.js";
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

function resultLooksError(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && (result as { isError?: unknown }).isError);
}

async function auditWrappedTool(
  toolName: string,
  args: unknown,
  outcome: McpToolAuditOutcome,
  result?: unknown,
  errorMessage?: string
): Promise<void> {
  await recordMcpToolCallAudit({ toolName, args, outcome, result, errorMessage });
}

/**
 * Wrap MCP tool handlers with mcp-proxy pipeline hooks (Panguard, x402, …)
 * and OpenTelemetry spans. Every call except `audit` is also appended to the
 * in-process audit ring (and Loki when configured).
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
        const result = err.toToolResult() as TResult;
        await auditWrappedTool(toolName, args[0], "payment_required", result);
        return result;
      }
      if (isX402McpPaymentError(err)) {
        const result = err.toToolResult() as TResult;
        await auditWrappedTool(toolName, args[0], "payment_required", result);
        return result;
      }
      // Surface Panguard denials as MCP tool errors (OpenCode otherwise shows
      // a generic "An error has occurred" and loses the policy reason).
      const blocked = clawqlPolicyBlockMessage(err);
      if (blocked) {
        const result = {
          content: [{ type: "text" as const, text: blocked }],
          isError: true,
        } as TResult;
        await auditWrappedTool(toolName, args[0], "blocked", result, blocked);
        return result;
      }
      await auditWrappedTool(
        toolName,
        args[0],
        "thrown",
        undefined,
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
    try {
      const result = await handler(...args);
      await auditWrappedTool(
        toolName,
        args[0],
        resultLooksError(result) ? "error" : "ok",
        result
      );
      return result;
    } catch (err: unknown) {
      await auditWrappedTool(
        toolName,
        args[0],
        "thrown",
        undefined,
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  });
}

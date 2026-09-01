import {
  appendProcessWormEffect,
  wormInputFromToolAttempt,
  wormInputFromToolResult,
} from "clawql-audit";
import { Effect } from "effect";
import { isX402McpPaymentError } from "clawql-payments/x402";
import { isMppMcpJsonRpcPaymentError } from "clawql-payments/mpp";
import { runMcpProxyBeforeCallTool } from "./clawql-api-adapters.js";
import { recordMcpToolCallAudit, type McpToolAuditOutcome } from "./mcp-tool-audit.js";
import { wrapMcpToolHandler } from "./otel-tracing.js";

/** Meta tools — ring buffer only; skip durable WORM to avoid noise/recursion. */
export const WORM_AUDIT_SKIP_TOOLS = new Set(["audit", "cache"]);

function clawqlPolicyBlockMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const rec = err as { _tag?: string; reason?: unknown; message?: unknown; cause?: unknown };
  if (typeof rec.reason === "string" && rec.reason.includes("Panguard policy blocked")) {
    return rec.reason;
  }
  if (typeof rec.message === "string" && rec.message.includes("Panguard policy blocked")) {
    return rec.message;
  }
  if (rec.cause) return clawqlPolicyBlockMessage(rec.cause);
  return null;
}

function argKeysFromToolArgs(args: unknown): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  return Object.keys(args as Record<string, unknown>);
}

function resultLooksError(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && (result as { isError?: unknown }).isError);
}

function toolResultLooksOk(result: unknown): boolean {
  if (!result || typeof result !== "object") return true;
  const rec = result as { isError?: boolean };
  return rec.isError !== true;
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

function appendMcpToolAttemptEffect(toolName: string, args: unknown): Effect.Effect<void> {
  if (WORM_AUDIT_SKIP_TOOLS.has(toolName) || toolName === "execute") {
    return Effect.void;
  }
  return Effect.gen(function* () {
    const input = yield* wormInputFromToolAttempt({
      toolName,
      argKeys: argKeysFromToolArgs(args),
      source: "mcp",
    });
    yield* appendProcessWormEffect(input);
  }).pipe(Effect.catchAll(() => Effect.void));
}

function appendMcpToolResultEffect(
  toolName: string,
  ok: boolean,
  detail?: string
): Effect.Effect<void> {
  if (WORM_AUDIT_SKIP_TOOLS.has(toolName) || toolName === "execute") {
    return Effect.void;
  }
  return Effect.gen(function* () {
    const input = yield* wormInputFromToolResult({
      toolName,
      ok,
      detail,
      source: "mcp",
    });
    yield* appendProcessWormEffect(input);
  }).pipe(Effect.catchAll(() => Effect.void));
}

/**
 * Wrap MCP tool handlers with mcp-proxy pipeline hooks (Panguard, x402, …),
 * durable WORM audit (when CLAWQL_WORM_ENABLED), ephemeral ring audit, and OTEL spans.
 */
export function wrapRegisteredMcpToolHandler<TArgs extends unknown[], TResult>(
  toolName: string,
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return wrapMcpToolHandler(toolName, async (...args: TArgs): Promise<TResult> => {
    await Effect.runPromise(appendMcpToolAttemptEffect(toolName, args[0]));

    try {
      await runMcpProxyBeforeCallTool(toolName, args[0]);
    } catch (err: unknown) {
      const errDetail =
        clawqlPolicyBlockMessage(err) ?? (err instanceof Error ? err.message : String(err));
      await Effect.runPromise(appendMcpToolResultEffect(toolName, false, errDetail));

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
      const blocked = clawqlPolicyBlockMessage(err);
      if (blocked) {
        const result = {
          content: [{ type: "text" as const, text: blocked }],
          isError: true,
        } as TResult;
        await auditWrappedTool(toolName, args[0], "blocked", result, blocked);
        return result;
      }
      await auditWrappedTool(toolName, args[0], "thrown", undefined, errDetail);
      throw err;
    }

    try {
      const result = await handler(...args);
      const ok = toolResultLooksOk(result);
      await Effect.runPromise(
        appendMcpToolResultEffect(
          toolName,
          ok,
          ok ? undefined : JSON.stringify(result).slice(0, 500)
        )
      );
      await auditWrappedTool(toolName, args[0], resultLooksError(result) ? "error" : "ok", result);
      return result;
    } catch (err: unknown) {
      const errDetail = err instanceof Error ? err.message : String(err);
      await Effect.runPromise(appendMcpToolResultEffect(toolName, false, errDetail));
      await auditWrappedTool(toolName, args[0], "thrown", undefined, errDetail);
      throw err;
    }
  });
}

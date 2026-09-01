import {
  appendProcessWormEffect,
  wormInputFromToolAttempt,
  wormInputFromToolResult,
} from "clawql-audit";
import { Effect } from "effect";
import { isX402McpPaymentError } from "clawql-payments/x402";
import { isMppMcpJsonRpcPaymentError } from "clawql-payments/mpp";
import { runMcpProxyBeforeCallTool } from "./clawql-api-adapters.js";
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

function toolResultLooksOk(result: unknown): boolean {
  if (!result || typeof result !== "object") return true;
  const rec = result as { isError?: boolean };
  return rec.isError !== true;
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
 * durable WORM audit (when CLAWQL_WORM_ENABLED), and OpenTelemetry spans.
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
      await Effect.runPromise(
        appendMcpToolResultEffect(
          toolName,
          false,
          clawqlPolicyBlockMessage(err) ?? (err instanceof Error ? err.message : String(err))
        )
      );

      if (isMppMcpJsonRpcPaymentError(err)) {
        return err.toToolResult() as TResult;
      }
      if (isX402McpPaymentError(err)) {
        return err.toToolResult() as TResult;
      }
      const blocked = clawqlPolicyBlockMessage(err);
      if (blocked) {
        return {
          content: [{ type: "text" as const, text: blocked }],
          isError: true,
        } as TResult;
      }
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
      return result;
    } catch (err: unknown) {
      await Effect.runPromise(
        appendMcpToolResultEffect(
          toolName,
          false,
          err instanceof Error ? err.message : String(err)
        )
      );
      throw err;
    }
  });
}

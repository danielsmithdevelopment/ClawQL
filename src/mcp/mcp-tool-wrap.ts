import { Effect } from "effect";
import { isPreExecuteEmptyCached } from "clawql-api";
import { runMcpProxyBeforeCallTool } from "../composition/clawql-api-adapters.js";
import { recordMcpToolCallAuditSync, type McpToolAuditOutcome } from "./mcp-tool-audit.js";
import { wrapMcpToolHandler } from "../observability/otel-tracing.js";
import { getMcpRequestContext } from "./mcp-request-context.js";

/** Meta tools — ring buffer only; skip durable WORM to avoid noise/recursion. */
export const WORM_AUDIT_SKIP_TOOLS = new Set(["audit", "cache"]);

function clawqlPolicyBlockMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const rec = err as { _tag?: string; reason?: unknown; message?: unknown; cause?: unknown };
  // ClawQLError / tagged policy failures often have empty Error.message — surface `reason`.
  if (typeof rec.reason === "string" && rec.reason.trim() !== "") {
    const reason = rec.reason.trim();
    if (
      reason.includes("Panguard policy blocked") ||
      reason.includes("CAPABILITY_WRITE_INTERCEPTED") ||
      rec._tag === "ClawQLError"
    ) {
      return reason;
    }
  }
  if (typeof rec.message === "string" && rec.message.includes("Panguard policy blocked")) {
    return rec.message;
  }
  if (rec.cause) return clawqlPolicyBlockMessage(rec.cause);
  return null;
}

function emitPanguardDenyTelemetryEffect(toolName: string, reason: string): Effect.Effect<void> {
  return Effect.gen(function* () {
    // Lazy: clawql-observability stays out of the cold import graph when denies are rare.
    const obs = yield* Effect.promise(() => import("clawql-observability"));
    const lokiPushUrl = yield* obs.resolvePanguardTelemetryLokiUrlEffect();
    yield* obs.emitPanguardTelemetryEffect({ toolName, verdict: "deny", reason }, { lokiPushUrl });
  }).pipe(Effect.catch(() => Effect.void));
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

function auditWrappedTool(
  toolName: string,
  args: unknown,
  outcome: McpToolAuditOutcome,
  result?: unknown,
  errorMessage?: string
): void {
  recordMcpToolCallAuditSync({ toolName, args, outcome, result, errorMessage });
}

/** Sync gate — avoid dynamic import + Effect.runPromise when WORM is off (bench/default). */
function isProcessWormEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAWQL_WORM_ENABLED?.trim() === "1";
}

function appendMcpToolAttemptEffect(toolName: string, args: unknown): Effect.Effect<void> {
  if (WORM_AUDIT_SKIP_TOOLS.has(toolName) || toolName === "execute") {
    return Effect.void;
  }
  if (!isProcessWormEnabled()) {
    return Effect.void;
  }
  return Effect.gen(function* () {
    const audit = yield* Effect.promise(() => import("clawql-audit"));
    const input = yield* audit.wormInputFromToolAttempt({
      toolName,
      argKeys: argKeysFromToolArgs(args),
      source: "mcp",
    });
    yield* audit.appendProcessWormEffect(input);
  }).pipe(Effect.catch(() => Effect.void));
}

function appendMcpToolResultEffect(
  toolName: string,
  ok: boolean,
  detail?: string
): Effect.Effect<void> {
  if (WORM_AUDIT_SKIP_TOOLS.has(toolName) || toolName === "execute") {
    return Effect.void;
  }
  if (!isProcessWormEnabled()) {
    return Effect.void;
  }
  return Effect.gen(function* () {
    const audit = yield* Effect.promise(() => import("clawql-audit"));
    const input = yield* audit.wormInputFromToolResult({
      toolName,
      ok,
      detail,
      source: "mcp",
    });
    yield* audit.appendProcessWormEffect(input);
  }).pipe(Effect.catch(() => Effect.void));
}

type PaymentToolResultErr = {
  toToolResult: () => unknown;
};

function looksLikePaymentToolResultError(err: unknown): err is PaymentToolResultErr {
  return Boolean(
    err &&
      typeof err === "object" &&
      typeof (err as { toToolResult?: unknown }).toToolResult === "function"
  );
}

/**
 * Wrap MCP tool handlers with mcp-proxy pipeline hooks (Panguard, x402, …),
 * durable WORM audit (when CLAWQL_WORM_ENABLED), ephemeral ring audit, and OTEL spans.
 *
 * Heavy packages (payments, observability, audit append) load only on the paths that need them
 * so equal-arm / Core-only compositions keep a smaller cold RSS (§11.1).
 */
function shouldAppendWorm(toolName: string): boolean {
  return (
    isProcessWormEnabled() && !WORM_AUDIT_SKIP_TOOLS.has(toolName) && toolName !== "execute"
  );
}

export function wrapRegisteredMcpToolHandler<TArgs extends unknown[], TResult>(
  toolName: string,
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return wrapMcpToolHandler(toolName, async (...args: TArgs): Promise<TResult> => {
    if (shouldAppendWorm(toolName)) {
      await Effect.runPromise(appendMcpToolAttemptEffect(toolName, args[0]));
    }

    try {
      // Skip Promise scheduling once pre-execute list is known empty (Bun HTTP p999).
      if (!isPreExecuteEmptyCached(toolName)) {
        const mcpCtx = getMcpRequestContext();
        await runMcpProxyBeforeCallTool(toolName, args[0], {
          sessionId: mcpCtx?.sessionId,
          atrScopeTokens: mcpCtx?.atrScopeTokens,
        });
      }
    } catch (err: unknown) {
      const errDetail =
        clawqlPolicyBlockMessage(err) ?? (err instanceof Error ? err.message : String(err));
      if (shouldAppendWorm(toolName)) {
        await Effect.runPromise(appendMcpToolResultEffect(toolName, false, errDetail));
      }

      if (looksLikePaymentToolResultError(err)) {
        const [{ isMppMcpJsonRpcPaymentError }, { isX402McpPaymentError }] = await Promise.all([
          import("clawql-payments/mpp"),
          import("clawql-payments/x402"),
        ]);
        if (isMppMcpJsonRpcPaymentError(err)) {
          const result = err.toToolResult() as TResult;
          auditWrappedTool(toolName, args[0], "payment_required", result);
          return result;
        }
        if (isX402McpPaymentError(err)) {
          const result = err.toToolResult() as TResult;
          auditWrappedTool(toolName, args[0], "payment_required", result);
          return result;
        }
      }
      const blocked = clawqlPolicyBlockMessage(err);
      if (blocked) {
        await Effect.runPromise(emitPanguardDenyTelemetryEffect(toolName, blocked));
        try {
          const { emitHookBlocked } = await import("clawql-mcp-events");
          const mcpCtxBlocked = getMcpRequestContext();
          emitHookBlocked({
            tool: toolName,
            reason: blocked,
            session_id: mcpCtxBlocked?.sessionId,
          });
        } catch {
          /* mcp-events optional at edge */
        }
        const result = {
          content: [{ type: "text" as const, text: blocked }],
          isError: true,
        } as TResult;
        auditWrappedTool(toolName, args[0], "blocked", result, blocked);
        return result;
      }
      auditWrappedTool(toolName, args[0], "thrown", undefined, errDetail);
      throw err;
    }

    try {
      const result = await handler(...args);
      const ok = toolResultLooksOk(result);
      if (shouldAppendWorm(toolName)) {
        await Effect.runPromise(
          appendMcpToolResultEffect(
            toolName,
            ok,
            ok ? undefined : JSON.stringify(result).slice(0, 500)
          )
        );
      }
      auditWrappedTool(toolName, args[0], resultLooksError(result) ? "error" : "ok", result);
      return result;
    } catch (err: unknown) {
      const errDetail = err instanceof Error ? err.message : String(err);
      if (shouldAppendWorm(toolName)) {
        await Effect.runPromise(appendMcpToolResultEffect(toolName, false, errDetail));
      }
      auditWrappedTool(toolName, args[0], "thrown", undefined, errDetail);
      throw err;
    }
  });
}

import { Effect } from "effect";
import {
  accumulateNativeToolReadAfterSuccess,
  composeMostRestrictiveEffect,
  composedGateToMcpResult,
  evaluateNativeToolGate,
  NATIVE_TOOL_GOVERNANCE_MODULE_ID,
  openAppaAfterToolResultEffect,
  openAppaBeforeToolCallEffect,
  openAppaEnabled,
  type OpenAppaGateVerdict,
} from "clawql-api";
import { runMcpProxyBeforeCallTool } from "../composition/clawql-api-adapters.js";
import { recordMcpToolCallAudit, type McpToolAuditOutcome } from "./mcp-tool-audit.js";
import { wrapMcpToolHandler } from "../observability/otel-tracing.js";
import { getMcpRequestContext } from "./mcp-request-context.js";

/** Meta tools — ring buffer only; skip durable WORM to avoid noise/recursion. */
export const WORM_AUDIT_SKIP_TOOLS = new Set(["audit", "cache"]);

/** CI / audits: prove wrap imports the native governance choke point. */
export const MCP_TOOL_WRAP_GOVERNANCE_ID = NATIVE_TOOL_GOVERNANCE_MODULE_ID;

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

function appendOpenAppaDecisionEffect(
  toolName: string,
  verdict: OpenAppaGateVerdict,
  sessionId?: string
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const audit = yield* Effect.promise(() => import("clawql-audit"));
    const status = verdict.allow
      ? ("allow" as const)
      : verdict.status === "mandate_required"
        ? ("mandate_required" as const)
        : ("blocked" as const);
    const input = yield* audit.wormInputFromOpenAppaDecision({
      toolName,
      status,
      reason: verdict.allow ? `OpenAPPA ${verdict.decision.decision}` : verdict.reason,
      decision: verdict.decision.decision,
      class: verdict.decision.class,
      sessionId,
    });
    yield* audit.appendProcessWormEffect(input);
  }).pipe(Effect.catch(() => Effect.void));
}

function appendLayerComposeEffect(
  toolName: string,
  composed: {
    readonly allow: boolean;
    readonly status?: "blocked" | "mandate_required";
    readonly reason?: string;
    readonly mechanism?: string;
    readonly layers: readonly { layer: string; status: string; reason: string }[];
  },
  sessionId?: string
): Effect.Effect<void> {
  if (composed.allow && composed.layers.length === 0) return Effect.void;
  return Effect.gen(function* () {
    const audit = yield* Effect.promise(() => import("clawql-audit"));
    const input = yield* audit.wormInputFromLayerCompose({
      toolName,
      status: composed.allow ? "allow" : (composed.status ?? "blocked"),
      reason: composed.reason ?? (composed.allow ? "all layers allow" : "composed deny"),
      mechanism: composed.mechanism ?? (composed.allow ? "allow" : "composed_block"),
      layers: composed.layers,
      sessionId,
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
 * Wrap MCP tool handlers with mcp-proxy pipeline hooks (Panguard, OpenAPPA, x402, …),
 * durable WORM audit (when CLAWQL_WORM_ENABLED), ephemeral ring audit, and OTEL spans.
 *
 * Order: Panguard (Layer 4) → OpenAPPA (Layer 5) → session IFC / handler → OpenAPPA tool_result.
 *
 * Heavy packages (payments, observability, audit append) load only on the paths that need them
 * so equal-arm / Core-only compositions keep a smaller cold RSS (§11.1).
 */
export function wrapRegisteredMcpToolHandler<TArgs extends unknown[], TResult>(
  toolName: string,
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return wrapMcpToolHandler(toolName, async (...args: TArgs): Promise<TResult> => {
    await Effect.runPromise(appendMcpToolAttemptEffect(toolName, args[0]));

    try {
      const mcpCtx = getMcpRequestContext();
      await runMcpProxyBeforeCallTool(toolName, args[0], {
        sessionId: mcpCtx?.sessionId,
        atrScopeTokens: mcpCtx?.atrScopeTokens,
      });
    } catch (err: unknown) {
      const errDetail =
        clawqlPolicyBlockMessage(err) ?? (err instanceof Error ? err.message : String(err));
      await Effect.runPromise(appendMcpToolResultEffect(toolName, false, errDetail));

      if (looksLikePaymentToolResultError(err)) {
        const [{ isMppMcpJsonRpcPaymentError }, { isX402McpPaymentError }] = await Promise.all([
          import("clawql-payments/mpp"),
          import("clawql-payments/x402"),
        ]);
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
        await auditWrappedTool(toolName, args[0], "blocked", result, blocked);
        return result;
      }
      await auditWrappedTool(toolName, args[0], "thrown", undefined, errDetail);
      throw err;
    }

    // Layer 5 OpenAPPA (opt-in) + session IFC / park — most restrictive wins.
    // OpenAPPA allow never overrides a later IFC block/park; dual mandates coalesce.
    const openAppaCallId = `clawql-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let openAppaVerdict: OpenAppaGateVerdict | null = null;
    if (openAppaEnabled()) {
      const mcpCtxOpen = getMcpRequestContext();
      openAppaVerdict = await Effect.runPromise(
        openAppaBeforeToolCallEffect({
          toolName,
          args: args[0],
          sessionId: mcpCtxOpen?.sessionId,
          // Caller surface for allow-cache isolation (opencode wire has no principal).
          atrScopeTokens: mcpCtxOpen?.atrScopeTokens,
          callId: openAppaCallId,
        })
      );
      await Effect.runPromise(
        appendOpenAppaDecisionEffect(toolName, openAppaVerdict, mcpCtxOpen?.sessionId)
      );
      // Hard OpenAPPA block stops before IFC (deny from any layer stops the call).
      if (!openAppaVerdict.allow && openAppaVerdict.status === "blocked") {
        const composed = await Effect.runPromise(
          composeMostRestrictiveEffect(openAppaVerdict, null)
        );
        if (!composed.allow) {
          const blockedResult = composedGateToMcpResult(composed) as TResult;
          const detail = composed.reason.slice(0, 500);
          await Effect.runPromise(
            appendLayerComposeEffect(toolName, composed, mcpCtxOpen?.sessionId)
          );
          await Effect.runPromise(appendMcpToolResultEffect(toolName, false, detail));
          await auditWrappedTool(toolName, args[0], "blocked", blockedResult, detail);
          return blockedResult;
        }
      }
    }

    // Native-tool choke point: session IFC + park destructive (same properties as execute).
    // Catalog execute-path tools skip this body; they are gated inside execute-core.
    try {
      const mcpCtxGate = getMcpRequestContext();
      const nativeDecision = await evaluateNativeToolGate({
        toolName,
        args: args[0],
        sessionId: mcpCtxGate?.sessionId,
      });
      const composed = await Effect.runPromise(
        composeMostRestrictiveEffect(
          openAppaVerdict,
          nativeDecision
            ? {
                status: nativeDecision.status,
                reason: nativeDecision.reason,
                mechanism: nativeDecision.mechanism,
                executionId: nativeDecision.executionId,
              }
            : null
        )
      );
      if (!composed.allow) {
        const blockedResult = composedGateToMcpResult(composed) as TResult;
        const detail = composed.reason.slice(0, 500);
        await Effect.runPromise(
          appendLayerComposeEffect(toolName, composed, mcpCtxGate?.sessionId)
        );
        await Effect.runPromise(appendMcpToolResultEffect(toolName, false, detail));
        await auditWrappedTool(toolName, args[0], "blocked", blockedResult, detail);
        return blockedResult;
      }
      if (openAppaVerdict || nativeDecision) {
        await Effect.runPromise(
          appendLayerComposeEffect(toolName, composed, mcpCtxGate?.sessionId)
        );
      }
    } catch (err: unknown) {
      const errDetail = err instanceof Error ? err.message : String(err);
      await Effect.runPromise(appendMcpToolResultEffect(toolName, false, errDetail));
      await auditWrappedTool(toolName, args[0], "thrown", undefined, errDetail);
      throw err;
    }

    try {
      const result = await handler(...args);
      const ok = toolResultLooksOk(result);
      const mcpCtxAfter = getMcpRequestContext();
      if (ok) {
        accumulateNativeToolReadAfterSuccess({
          toolName,
          success: true,
          sessionId: mcpCtxAfter?.sessionId,
          result,
        });
      }

      let finalResult = result;
      if (openAppaEnabled()) {
        const after = await Effect.runPromise(
          openAppaAfterToolResultEffect({
            toolName,
            args: args[0],
            sessionId: mcpCtxAfter?.sessionId,
            callId: openAppaCallId,
            outcome: ok
              ? { status: "success", body: result }
              : {
                  status: "failure",
                  message: JSON.stringify(result).slice(0, 2000),
                },
          })
        );
        if (after.action === "replace") {
          finalResult = {
            content: [{ type: "text" as const, text: after.value }],
            isError: false,
          } as TResult;
        } else if (after.action === "error") {
          finalResult = {
            content: [{ type: "text" as const, text: after.reason }],
            isError: true,
          } as TResult;
        }
      }

      const finalOk = toolResultLooksOk(finalResult);
      await Effect.runPromise(
        appendMcpToolResultEffect(
          toolName,
          finalOk,
          finalOk ? undefined : JSON.stringify(finalResult).slice(0, 500)
        )
      );
      await auditWrappedTool(
        toolName,
        args[0],
        resultLooksError(finalResult) ? "error" : "ok",
        finalResult
      );
      return finalResult;
    } catch (err: unknown) {
      const errDetail = err instanceof Error ? err.message : String(err);
      if (openAppaEnabled()) {
        const mcpCtxFail = getMcpRequestContext();
        await Effect.runPromise(
          openAppaAfterToolResultEffect({
            toolName,
            args: args[0],
            sessionId: mcpCtxFail?.sessionId,
            callId: openAppaCallId,
            outcome: { status: "failure", message: errDetail.slice(0, 2000) },
          })
        );
      }
      await Effect.runPromise(appendMcpToolResultEffect(toolName, false, errDetail));
      await auditWrappedTool(toolName, args[0], "thrown", undefined, errDetail);
      throw err;
    }
  });
}

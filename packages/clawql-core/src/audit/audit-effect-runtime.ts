/**
 * MCP `audit` tool as Effect.gen over {@link AuditService}
 * (parity with cache’s runCacheOperation bridge).
 */

import { Cause, Effect, Exit } from "effect";
import { AuditLive, AuditService } from "./audit-service.js";
import type { AuditInputDecoded } from "./audit-input-schema.js";
import type { ClawqlAuditEntry } from "./types.js";

/** @deprecated Prefer {@link AuditInputDecoded} from Effect Schema. */
export type AuditToolParams = {
  operation: "append" | "list" | "clear";
  category?: string;
  action?: string;
  summary?: string;
  correlationId?: string;
  limit?: number;
};

export type AuditToolMcpResult = { content: { type: "text"; text: string }[] };

export type AuditToolSideEffects = {
  readonly onAppend?: (entry: ClawqlAuditEntry, total: number, dropped: number) => void;
  readonly onClear?: () => void;
  readonly onShapeLog?: (meta: Record<string, unknown>) => void;
};

function jsonResponse(obj: unknown): AuditToolMcpResult {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

/**
 * Effect Schema–validated audit pipeline: AuditService op → optional side effects.
 */
export function executeAuditToolEffect(
  parsed: AuditInputDecoded,
  sideEffects: AuditToolSideEffects = {}
): Effect.Effect<AuditToolMcpResult, never, AuditService> {
  return Effect.gen(function* () {
    const audit = yield* AuditService;
    sideEffects.onShapeLog?.({
      operation: parsed.operation,
      categoryLen: parsed.operation === "append" ? parsed.category.length : undefined,
      actionLen: parsed.operation === "append" ? parsed.action.length : undefined,
      summaryLen: parsed.operation === "append" ? parsed.summary.length : undefined,
      correlationIdLen: parsed.operation === "append" ? parsed.correlationId?.length : undefined,
    });

    switch (parsed.operation) {
      case "append": {
        const { total, dropped, entry } = yield* audit.append({
          category: parsed.category,
          action: parsed.action,
          summary: parsed.summary,
          correlationId: parsed.correlationId,
        });
        sideEffects.onAppend?.(entry, total, dropped);
        return jsonResponse({ ok: true, total, dropped });
      }
      case "list": {
        const { total, maxEntries, entries } = yield* audit.list(parsed.limit);
        return jsonResponse({ ok: true, total, maxEntries, entries });
      }
      case "clear": {
        const { cleared } = yield* audit.clear();
        sideEffects.onClear?.();
        return jsonResponse({ ok: true, cleared });
      }
      default:
        return jsonResponse({ ok: false, error: "unsupported operation" });
    }
  });
}

/** Run audit MCP operation with {@link AuditLive}. */
export async function runAuditOperation(
  parsed: AuditInputDecoded,
  sideEffects?: AuditToolSideEffects
): Promise<AuditToolMcpResult> {
  const exit = await Effect.runPromiseExit(
    executeAuditToolEffect(parsed, sideEffects).pipe(Effect.provide(AuditLive))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
}

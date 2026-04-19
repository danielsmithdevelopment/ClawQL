/**
 * In-process audit ring buffer for MCP `audit` tool (GitHub #89).
 * **Not durable** — restart clears buffer; use `memory_ingest` for compliance-grade trails.
 */

import { z } from "zod";
import { logMcpToolShape } from "./mcp-tool-log.js";

export type ClawqlAuditEntry = {
  ts: string;
  category: string;
  action: string;
  summary: string;
  correlationId?: string;
};

const buffer: ClawqlAuditEntry[] = [];

/** Exported for tests — `CLAWQL_AUDIT_MAX_ENTRIES` (default 500, min 1, max 50_000). */
export function getClawqlAuditMaxEntries(): number {
  const v = process.env.CLAWQL_AUDIT_MAX_ENTRIES?.trim();
  if (!v) return 500;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return 500;
  return Math.min(Math.max(n, 1), 50_000);
}

/** Test helper — clears buffer. */
export function resetClawqlAuditBufferForTests(): void {
  buffer.length = 0;
}

export const auditToolSchema = {
  operation: z
    .enum(["append", "list", "clear"])
    .describe(
      "append — record a redacted audit line; list — recent events; clear — empty buffer (operator/test)."
    ),
  category: z
    .string()
    .max(64)
    .optional()
    .describe("For append: short category (e.g. tool_call, payment, policy)."),
  action: z.string().max(128).optional().describe("For append: action name or verb."),
  summary: z
    .string()
    .max(512)
    .optional()
    .describe("For append: human-readable summary — avoid secrets."),
  correlationId: z
    .string()
    .max(128)
    .optional()
    .describe("Optional id to correlate with logs or memory_ingest."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("For list: max entries (default 20)."),
};

const auditInputSchema = z.object(auditToolSchema).superRefine((data, ctx) => {
  switch (data.operation) {
    case "append": {
      const cat = data.category?.trim();
      const act = data.action?.trim();
      const sum = data.summary?.trim();
      if (!cat) ctx.addIssue({ code: "custom", message: "append requires category" });
      if (!act) ctx.addIssue({ code: "custom", message: "append requires action" });
      if (!sum) ctx.addIssue({ code: "custom", message: "append requires summary" });
      break;
    }
    case "list":
    case "clear":
      break;
    default:
      break;
  }
});

function jsonResponse(obj: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
}

export async function handleAuditToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = auditInputSchema.parse(params);
  const max = getClawqlAuditMaxEntries();

  logMcpToolShape("audit", {
    operation: parsed.operation,
    categoryLen: parsed.category?.length,
    actionLen: parsed.action?.length,
    summaryLen: parsed.summary?.length,
    correlationIdLen: parsed.correlationId?.length,
  });

  switch (parsed.operation) {
    case "append": {
      const entry: ClawqlAuditEntry = {
        ts: new Date().toISOString(),
        category: parsed.category!.trim(),
        action: parsed.action!.trim(),
        summary: parsed.summary!.trim(),
        correlationId: parsed.correlationId?.trim() || undefined,
      };
      buffer.push(entry);
      let dropped = 0;
      while (buffer.length > max) {
        buffer.shift();
        dropped++;
      }
      return jsonResponse({ ok: true, total: buffer.length, dropped });
    }
    case "list": {
      const limit = parsed.limit ?? 20;
      const slice = buffer.slice(-limit);
      return jsonResponse({
        ok: true,
        total: buffer.length,
        maxEntries: max,
        entries: slice,
      });
    }
    case "clear": {
      const n = buffer.length;
      buffer.length = 0;
      return jsonResponse({ ok: true, cleared: n });
    }
    default:
      return jsonResponse({ ok: false, error: "unsupported operation" });
  }
}

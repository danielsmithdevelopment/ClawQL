/**
 * In-process audit ring buffer for MCP `audit` tool (GitHub #89).
 * **Not durable** — restart clears buffer; use `memory_ingest` for compliance-grade trails.
 *
 * Ring buffer + config live in `clawql-core`; this module adds MCP/Zod, Loki, and Prometheus.
 * Operations run through {@link runAuditOperation} / {@link AuditService} (same bridge as cache).
 */

import {
  getClawqlAuditMaxEntries,
  resetDefaultAuditRingBufferForTests,
  runAuditOperation,
  type ClawqlAuditEntry,
} from "clawql-core";
import { z } from "zod";
import { maybePushAuditEntryToLoki } from "./clawql-audit-loki.js";
import { logMcpToolShape } from "./mcp-tool-log.js";
import { prometheusRecordAuditAppend, prometheusRecordAuditClear } from "clawql-api";

export type { ClawqlAuditEntry };

export {
  getClawqlAuditMaxEntries,
  resetDefaultAuditRingBufferForTests as resetClawqlAuditBufferForTests,
};

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

export async function handleAuditToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = auditInputSchema.parse(params);
  return runAuditOperation(parsed, {
    onShapeLog: (meta) => logMcpToolShape("audit", meta),
    onAppend: (entry, total, dropped) => {
      prometheusRecordAuditAppend(total, dropped);
      maybePushAuditEntryToLoki(entry);
    },
    onClear: () => prometheusRecordAuditClear(),
  });
}

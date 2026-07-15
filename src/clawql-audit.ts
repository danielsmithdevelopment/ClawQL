/**
 * In-process audit ring buffer for MCP `audit` tool (GitHub #89).
 * **Not durable** — restart clears buffer; use `memory_ingest` for compliance-grade trails.
 *
 * Ring buffer + Effect Schema live in `clawql-core`; this module adds Loki and Prometheus.
 * Operations run through {@link runAuditOperation} / {@link AuditService}.
 */

import {
  decodeAuditInput,
  getClawqlAuditMaxEntries,
  resetDefaultAuditRingBufferForTests,
  runAuditOperation,
  type ClawqlAuditEntry,
} from "clawql-core";
import { Effect } from "effect";
import { maybePushAuditEntryToLoki } from "./clawql-audit-loki.js";
import { logMcpToolShape } from "./mcp-tool-log.js";
import { prometheusRecordAuditAppend, prometheusRecordAuditClear } from "clawql-api";

export type { ClawqlAuditEntry };

export {
  getClawqlAuditMaxEntries,
  resetDefaultAuditRingBufferForTests as resetClawqlAuditBufferForTests,
};

export async function handleAuditToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = await Effect.runPromise(decodeAuditInput(params));
  return runAuditOperation(parsed, {
    onShapeLog: (meta) => logMcpToolShape("audit", meta),
    onAppend: (entry, total, dropped) => {
      prometheusRecordAuditAppend(total, dropped);
      maybePushAuditEntryToLoki(entry);
    },
    onClear: () => prometheusRecordAuditClear(),
  });
}

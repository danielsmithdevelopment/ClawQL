/**
 * Append workflow events to the in-process audit ring buffer (same store as MCP `audit` tool).
 */

import { getDefaultAuditRingBuffer } from "clawql-core";

export function appendWorkflowAudit(input: {
  action: string;
  summary: string;
  correlationId?: string;
}): void {
  getDefaultAuditRingBuffer().append({
    ts: new Date().toISOString(),
    category: "workflow",
    action: input.action.trim(),
    summary: input.summary.trim().slice(0, 512),
    correlationId: input.correlationId?.trim() || undefined,
  });
}

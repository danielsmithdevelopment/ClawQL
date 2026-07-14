/**
 * Append workflow events to the in-process audit ring buffer (same store as MCP `audit` tool).
 *
 * Prefer {@link appendWorkflowAuditEffect} inside Effect.gen. The Promise-facing helper
 * provides {@link AuditLive} so schedule/workflow K8s paths keep a sync API.
 */

import { Effect } from "effect";
import { AuditLive, AuditService } from "clawql-core";

export type WorkflowAuditInput = {
  action: string;
  summary: string;
  correlationId?: string;
};

function toAppendInput(input: WorkflowAuditInput) {
  return {
    category: "workflow" as const,
    action: input.action.trim(),
    summary: input.summary.trim().slice(0, 512),
    correlationId: input.correlationId?.trim() || undefined,
  };
}

/** Effect form — requires {@link AuditService} in the environment. */
export function appendWorkflowAuditEffect(
  input: WorkflowAuditInput
): Effect.Effect<void, never, AuditService> {
  return Effect.gen(function* () {
    const audit = yield* AuditService;
    yield* audit.append(toAppendInput(input));
  });
}

/** Sync façade for Promise/K8s workflow paths; uses {@link AuditLive}. */
export function appendWorkflowAudit(input: WorkflowAuditInput): void {
  Effect.runSync(appendWorkflowAuditEffect(input).pipe(Effect.provide(AuditLive)));
}

/**
 * Typed producers for advertised MCP Events. Every catalog event (except deferred
 * stream.changed) must have a real caller of one of these helpers.
 */

import { emitMcpEvent, emitMcpEventBestEffort } from "./process-bridge.js";
import type { DeliveryOutcome } from "./types.js";

export function emitDocumentProcessed(input: {
  document_id: string;
  status: string;
  summary?: string;
  url?: string;
}): void {
  emitMcpEventBestEffort({
    name: "document.processed",
    data: {
      document_id: input.document_id,
      status: input.status,
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.url ? { url: input.url } : {}),
    },
  });
}

export function emitHookBlocked(input: {
  tool: string;
  reason: string;
  session_id?: string;
}): void {
  emitMcpEventBestEffort({
    name: "hook.blocked",
    data: {
      tool: input.tool,
      reason: input.reason,
      ...(input.session_id ? { session_id: input.session_id } : {}),
    },
  });
}

export function emitBudgetExhausted(input: {
  budget_id: string;
  exhausted_at?: string;
  scope?: string;
}): void {
  emitMcpEventBestEffort({
    name: "budget.exhausted",
    data: {
      budget_id: input.budget_id,
      exhausted_at: input.exhausted_at ?? new Date().toISOString(),
      ...(input.scope ? { scope: input.scope } : {}),
    },
  });
}

export function emitMandateCompleted(input: {
  mandate_id: string;
  status: string;
  summary?: string;
}): void {
  emitMcpEventBestEffort({
    name: "mandate.completed",
    data: {
      mandate_id: input.mandate_id,
      status: input.status,
      ...(input.summary ? { summary: input.summary } : {}),
    },
  });
}

export function emitClawqlNotification(input: {
  text: string;
  channel?: string;
  url?: string;
}): void {
  emitMcpEventBestEffort({
    name: "clawql.notification",
    data: {
      text: input.text,
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.url ? { url: input.url } : {}),
    },
  });
}

/** Test helper: await delivery for one producer. */
export async function emitDocumentProcessedAwait(input: {
  document_id: string;
  status: string;
  summary?: string;
  url?: string;
}): Promise<readonly DeliveryOutcome[]> {
  return emitMcpEvent({
    name: "document.processed",
    data: {
      document_id: input.document_id,
      status: input.status,
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.url ? { url: input.url } : {}),
    },
  });
}

export async function emitHookBlockedAwait(input: {
  tool: string;
  reason: string;
  session_id?: string;
}): Promise<readonly DeliveryOutcome[]> {
  return emitMcpEvent({
    name: "hook.blocked",
    data: {
      tool: input.tool,
      reason: input.reason,
      ...(input.session_id ? { session_id: input.session_id } : {}),
    },
  });
}

export async function emitBudgetExhaustedAwait(input: {
  budget_id: string;
  exhausted_at?: string;
  scope?: string;
}): Promise<readonly DeliveryOutcome[]> {
  return emitMcpEvent({
    name: "budget.exhausted",
    data: {
      budget_id: input.budget_id,
      exhausted_at: input.exhausted_at ?? new Date().toISOString(),
      ...(input.scope ? { scope: input.scope } : {}),
    },
  });
}

export async function emitMandateCompletedAwait(input: {
  mandate_id: string;
  status: string;
  summary?: string;
}): Promise<readonly DeliveryOutcome[]> {
  return emitMcpEvent({
    name: "mandate.completed",
    data: {
      mandate_id: input.mandate_id,
      status: input.status,
      ...(input.summary ? { summary: input.summary } : {}),
    },
  });
}

export async function emitClawqlNotificationAwait(input: {
  text: string;
  channel?: string;
  url?: string;
}): Promise<readonly DeliveryOutcome[]> {
  return emitMcpEvent({
    name: "clawql.notification",
    data: {
      text: input.text,
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.url ? { url: input.url } : {}),
    },
  });
}

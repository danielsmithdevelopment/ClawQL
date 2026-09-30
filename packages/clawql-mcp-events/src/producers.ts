/**
 * Typed producers for advertised MCP Events. Every catalog event must have a
 * real caller of one of these helpers.
 */

import { emitMcpEvent, emitMcpEventBestEffort } from "./process-bridge.js";
import type { DeliveryOutcome } from "./types.js";

export function emitStreamChanged(input: {
  topic: string;
  summary: string;
  changed_at?: string;
  cursor?: string;
  /** Capped projection diff (added / removed / changed). */
  diff?: {
    added: unknown[];
    removed: unknown[];
    changed: Array<{ path: string; before: unknown; after: unknown }>;
    truncated: boolean;
  };
  watch_fields?: string[];
  /** MCP tool name to re-read the full stored projection (schedule get). */
  projection_tool?: string;
}): void {
  emitMcpEventBestEffort({
    name: "stream.changed",
    data: {
      topic: input.topic,
      summary: input.summary,
      changed_at: input.changed_at ?? new Date().toISOString(),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(input.diff ? { diff: input.diff } : {}),
      ...(input.watch_fields?.length ? { watch_fields: input.watch_fields } : {}),
      ...(input.projection_tool ? { projection_tool: input.projection_tool } : {}),
    },
  });
}

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

export function emitScheduleCompleted(input: {
  schedule_id: string;
  status: string;
  summary?: string;
}): void {
  emitMcpEventBestEffort({
    name: "schedule.completed",
    data: {
      schedule_id: input.schedule_id,
      status: input.status,
      ...(input.summary ? { summary: input.summary } : {}),
    },
  });
}

export function emitNotificationSent(input: {
  text: string;
  channel?: string;
  url?: string;
}): void {
  emitMcpEventBestEffort({
    name: "notification.sent",
    data: {
      text: input.text,
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.url ? { url: input.url } : {}),
    },
  });
}

/** Test helpers: await delivery for one producer. */
export async function emitStreamChangedAwait(input: {
  topic: string;
  summary: string;
  changed_at?: string;
  cursor?: string;
  diff?: {
    added: unknown[];
    removed: unknown[];
    changed: Array<{ path: string; before: unknown; after: unknown }>;
    truncated: boolean;
  };
  watch_fields?: string[];
  projection_tool?: string;
}): Promise<readonly DeliveryOutcome[]> {
  return emitMcpEvent({
    name: "stream.changed",
    data: {
      topic: input.topic,
      summary: input.summary,
      changed_at: input.changed_at ?? new Date().toISOString(),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(input.diff ? { diff: input.diff } : {}),
      ...(input.watch_fields?.length ? { watch_fields: input.watch_fields } : {}),
      ...(input.projection_tool ? { projection_tool: input.projection_tool } : {}),
    },
  });
}

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

export async function emitScheduleCompletedAwait(input: {
  schedule_id: string;
  status: string;
  summary?: string;
}): Promise<readonly DeliveryOutcome[]> {
  return emitMcpEvent({
    name: "schedule.completed",
    data: {
      schedule_id: input.schedule_id,
      status: input.status,
      ...(input.summary ? { summary: input.summary } : {}),
    },
  });
}

export async function emitNotificationSentAwait(input: {
  text: string;
  channel?: string;
  url?: string;
}): Promise<readonly DeliveryOutcome[]> {
  return emitMcpEvent({
    name: "notification.sent",
    data: {
      text: input.text,
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.url ? { url: input.url } : {}),
    },
  });
}

/**
 * In-memory + optional callback audit for web search/fetch provenance.
 * Regulated operators need fallback decisions recorded before the fallback runs.
 */

export type WebAuditEventType =
  | "WEB_SEARCH"
  | "WEB_SEARCH_FALLBACK"
  | "WEB_FETCH"
  | "WEB_SCREENSHOT"
  | "WEB_INTERACT"
  | "WEB_ERROR";

export type WebAuditEvent = {
  type: WebAuditEventType;
  ts: string;
  provider?: string;
  query?: string;
  url?: string;
  reason?: string;
  fallback?: string;
  correlationId?: string;
  ok?: boolean;
  detail?: string;
};

export type WebAuditSink = (event: WebAuditEvent) => void | Promise<void>;

const buffer: WebAuditEvent[] = [];
let sink: WebAuditSink | undefined;

export function setWebAuditSink(next: WebAuditSink | undefined): void {
  sink = next;
}

export function resetWebAuditForTests(): void {
  buffer.length = 0;
  sink = undefined;
}

export function listWebAuditEvents(): readonly WebAuditEvent[] {
  return [...buffer];
}

export async function appendWebAudit(event: Omit<WebAuditEvent, "ts"> & { ts?: string }): Promise<WebAuditEvent> {
  const full: WebAuditEvent = {
    ...event,
    ts: event.ts ?? new Date().toISOString(),
  };
  buffer.push(full);
  if (buffer.length > 500) buffer.shift();
  if (sink) await sink(full);
  return full;
}

import type { HitlWorkflowRef } from "../workflow/suspend-resume.js";
import { natsDocumentSubjectRoot, natsWorkflowSubjectRoot } from "./env.js";

export const WORKFLOW_EVENT_SCHEMA_VERSION = 1;

export type WorkflowEventType =
  "hitl.enqueued" | "hitl.completed" | "workflow.suspended" | "workflow.resumed";

export type WorkflowEventEnvelope = {
  schema_version: typeof WORKFLOW_EVENT_SCHEMA_VERSION;
  event_type: WorkflowEventType;
  subject: string;
  correlation_id?: string;
  workflow_ref?: HitlWorkflowRef;
  source: string;
  ts: string;
  payload?: Record<string, unknown>;
};

export type DocumentEventType = "coneshare.viewer";

export type DocumentEventEnvelope = {
  schema_version: typeof WORKFLOW_EVENT_SCHEMA_VERSION;
  event_type: DocumentEventType;
  subject: string;
  correlation_id?: string;
  source: string;
  ts: string;
  payload?: Record<string, unknown>;
};

export function workflowEventSubject(eventType: WorkflowEventType): string {
  return `${natsWorkflowSubjectRoot()}.${eventType}`;
}

export function documentEventSubject(eventType: DocumentEventType): string {
  return `${natsDocumentSubjectRoot()}.${eventType}`;
}

export function buildWorkflowEvent(
  eventType: WorkflowEventType,
  source: string,
  fields: {
    correlation_id?: string;
    workflow_ref?: HitlWorkflowRef;
    payload?: Record<string, unknown>;
  } = {}
): WorkflowEventEnvelope {
  return {
    schema_version: WORKFLOW_EVENT_SCHEMA_VERSION,
    event_type: eventType,
    subject: workflowEventSubject(eventType),
    source,
    ts: new Date().toISOString(),
    ...fields,
  };
}

export function buildDocumentEvent(
  eventType: DocumentEventType,
  source: string,
  fields: {
    correlation_id?: string;
    payload?: Record<string, unknown>;
  } = {}
): DocumentEventEnvelope {
  return {
    schema_version: WORKFLOW_EVENT_SCHEMA_VERSION,
    event_type: eventType,
    subject: documentEventSubject(eventType),
    source,
    ts: new Date().toISOString(),
    ...fields,
  };
}

export function parseWorkflowEvent(data: Uint8Array | string): WorkflowEventEnvelope | undefined {
  try {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    const parsed = JSON.parse(text) as WorkflowEventEnvelope;
    if (parsed?.schema_version !== WORKFLOW_EVENT_SCHEMA_VERSION) return undefined;
    if (!parsed.event_type || !parsed.subject) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

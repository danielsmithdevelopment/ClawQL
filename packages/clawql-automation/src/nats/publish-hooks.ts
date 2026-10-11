import { Effect } from "effect";
import type { HitlWorkflowRef } from "../workflow/suspend-resume.js";
import { publishDocumentEventEffect, publishWorkflowEventEffect } from "./client.js";
import { buildDocumentEvent, buildWorkflowEvent } from "./envelope.js";

export function publishHitlEnqueuedEventEffect(fields: {
  correlation_id?: string;
  workflow_ref?: HitlWorkflowRef;
  project_id: number;
  task_count: number;
}): Effect.Effect<boolean> {
  return publishWorkflowEventEffect(
    buildWorkflowEvent("hitl.enqueued", "hitl_enqueue_label_studio", {
      correlation_id: fields.correlation_id,
      workflow_ref: fields.workflow_ref,
      payload: {
        project_id: fields.project_id,
        task_count: fields.task_count,
      },
    })
  );
}

/** Promise façade. */
export async function publishHitlEnqueuedEvent(fields: {
  correlation_id?: string;
  workflow_ref?: HitlWorkflowRef;
  project_id: number;
  task_count: number;
}): Promise<boolean> {
  return Effect.runPromise(publishHitlEnqueuedEventEffect(fields));
}

export function publishHitlCompletedEventEffect(fields: {
  correlation_id?: string;
  workflow_ref?: HitlWorkflowRef;
  clawql_hitl?: unknown;
  source?: string;
}): Effect.Effect<boolean> {
  const payload: Record<string, unknown> = {};
  if (fields.clawql_hitl !== undefined) {
    payload.clawql_hitl = fields.clawql_hitl;
  }
  return publishWorkflowEventEffect(
    buildWorkflowEvent("hitl.completed", fields.source ?? "hitl-label-studio-webhook", {
      correlation_id: fields.correlation_id,
      workflow_ref: fields.workflow_ref,
      payload: Object.keys(payload).length > 0 ? payload : undefined,
    })
  );
}

/** Promise façade. */
export async function publishHitlCompletedEvent(fields: {
  correlation_id?: string;
  workflow_ref?: HitlWorkflowRef;
  clawql_hitl?: unknown;
  source?: string;
}): Promise<boolean> {
  return Effect.runPromise(publishHitlCompletedEventEffect(fields));
}

export function publishWorkflowResumedEventEffect(fields: {
  correlation_id?: string;
  workflow_ref: HitlWorkflowRef;
  resumed_nodes: string[];
  workflow_level_resumed: boolean;
  source: string;
}): Effect.Effect<boolean> {
  return publishWorkflowEventEffect(
    buildWorkflowEvent("workflow.resumed", fields.source, {
      correlation_id: fields.correlation_id,
      workflow_ref: fields.workflow_ref,
      payload: {
        resumed_nodes: fields.resumed_nodes,
        workflow_level_resumed: fields.workflow_level_resumed,
      },
    })
  );
}

/** Promise façade. */
export async function publishWorkflowResumedEvent(fields: {
  correlation_id?: string;
  workflow_ref: HitlWorkflowRef;
  resumed_nodes: string[];
  workflow_level_resumed: boolean;
  source: string;
}): Promise<boolean> {
  return Effect.runPromise(publishWorkflowResumedEventEffect(fields));
}

export function publishWorkflowSuspendedEventEffect(fields: {
  correlation_id?: string;
  workflow_ref: HitlWorkflowRef;
  source: string;
}): Effect.Effect<boolean> {
  return publishWorkflowEventEffect(
    buildWorkflowEvent("workflow.suspended", fields.source, {
      correlation_id: fields.correlation_id,
      workflow_ref: fields.workflow_ref,
    })
  );
}

/** Promise façade. */
export async function publishWorkflowSuspendedEvent(fields: {
  correlation_id?: string;
  workflow_ref: HitlWorkflowRef;
  source: string;
}): Promise<boolean> {
  return Effect.runPromise(publishWorkflowSuspendedEventEffect(fields));
}

export function publishConeshareViewerEventEffect(fields: {
  correlation_id?: string;
  workflow_ref?: HitlWorkflowRef;
  event_type: string;
  share_link_id?: string;
  room_url?: string;
  viewer_email?: string;
}): Effect.Effect<boolean> {
  return publishDocumentEventEffect(
    buildDocumentEvent("coneshare.viewer", "coneshare-webhook", {
      correlation_id: fields.correlation_id,
      workflow_ref: fields.workflow_ref,
      payload: {
        event_type: fields.event_type,
        share_link_id: fields.share_link_id,
        room_url: fields.room_url,
        viewer_email: fields.viewer_email,
      },
    })
  );
}

/** Promise façade. */
export async function publishConeshareViewerEvent(fields: {
  correlation_id?: string;
  workflow_ref?: HitlWorkflowRef;
  event_type: string;
  share_link_id?: string;
  room_url?: string;
  viewer_email?: string;
}): Promise<boolean> {
  return Effect.runPromise(publishConeshareViewerEventEffect(fields));
}

export function publishDocumentInboxArrivedEventEffect(fields: {
  correlation_id?: string;
  document_path: string;
  document_url?: string;
  processed_path?: string;
  redact_list?: string;
  dry_run?: boolean;
  source?: string;
}): Effect.Effect<boolean> {
  return publishDocumentEventEffect(
    buildDocumentEvent("inbox.arrived", fields.source ?? "nextcloud-webhook", {
      correlation_id: fields.correlation_id,
      payload: {
        document_path: fields.document_path,
        document_url: fields.document_url,
        processed_path: fields.processed_path,
        redact_list: fields.redact_list,
        dry_run: fields.dry_run === true,
      },
    })
  );
}

/** Promise façade. */
export async function publishDocumentInboxArrivedEvent(fields: {
  correlation_id?: string;
  document_path: string;
  document_url?: string;
  processed_path?: string;
  redact_list?: string;
  dry_run?: boolean;
  source?: string;
}): Promise<boolean> {
  return Effect.runPromise(publishDocumentInboxArrivedEventEffect(fields));
}

export function publishDocumentPipelineRequestedEventEffect(fields: {
  correlation_id?: string;
  document_path: string;
  document_url?: string;
  processed_path?: string;
  redact_list?: string;
  dry_run?: boolean;
  source?: string;
}): Effect.Effect<boolean> {
  return publishDocumentEventEffect(
    buildDocumentEvent("pipeline.requested", fields.source ?? "mcp", {
      correlation_id: fields.correlation_id,
      payload: {
        document_path: fields.document_path,
        document_url: fields.document_url,
        processed_path: fields.processed_path,
        redact_list: fields.redact_list,
        dry_run: fields.dry_run === true,
      },
    })
  );
}

/** Promise façade. */
export async function publishDocumentPipelineRequestedEvent(fields: {
  correlation_id?: string;
  document_path: string;
  document_url?: string;
  processed_path?: string;
  redact_list?: string;
  dry_run?: boolean;
  source?: string;
}): Promise<boolean> {
  return Effect.runPromise(publishDocumentPipelineRequestedEventEffect(fields));
}

export function publishDocumentPipelineHopEventEffect(fields: {
  correlation_id?: string;
  hop: Record<string, unknown>;
  source?: string;
}): Effect.Effect<boolean> {
  return publishDocumentEventEffect(
    buildDocumentEvent("pipeline.hop", fields.source ?? "run_idp_pipeline", {
      correlation_id: fields.correlation_id,
      payload: { hop: fields.hop },
    })
  );
}

/** Promise façade. */
export async function publishDocumentPipelineHopEvent(fields: {
  correlation_id?: string;
  hop: Record<string, unknown>;
  source?: string;
}): Promise<boolean> {
  return Effect.runPromise(publishDocumentPipelineHopEventEffect(fields));
}

export function publishDocumentPipelineTerminalEventEffect(fields: {
  ok: boolean;
  correlation_id?: string;
  document_path?: string;
  error?: string;
  completed_through?: number;
  source?: string;
}): Effect.Effect<boolean> {
  return publishDocumentEventEffect(
    buildDocumentEvent(
      fields.ok ? "pipeline.completed" : "pipeline.failed",
      fields.source ?? "nats-idp-pipeline-consumer",
      {
        correlation_id: fields.correlation_id,
        payload: {
          document_path: fields.document_path,
          error: fields.error,
          completed_through: fields.completed_through,
        },
      }
    )
  );
}

/** Promise façade. */
export async function publishDocumentPipelineTerminalEvent(fields: {
  ok: boolean;
  correlation_id?: string;
  document_path?: string;
  error?: string;
  completed_through?: number;
  source?: string;
}): Promise<boolean> {
  return Effect.runPromise(publishDocumentPipelineTerminalEventEffect(fields));
}

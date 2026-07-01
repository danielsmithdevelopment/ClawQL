import type { HitlWorkflowRef } from "../workflow/suspend-resume.js";
import { publishDocumentEvent, publishWorkflowEvent } from "./client.js";
import { buildDocumentEvent, buildWorkflowEvent } from "./envelope.js";

export async function publishHitlEnqueuedEvent(fields: {
  correlation_id?: string;
  workflow_ref?: HitlWorkflowRef;
  project_id: number;
  task_count: number;
}): Promise<boolean> {
  return publishWorkflowEvent(
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

export async function publishHitlCompletedEvent(fields: {
  correlation_id?: string;
  workflow_ref?: HitlWorkflowRef;
  clawql_hitl?: unknown;
  source?: string;
}): Promise<boolean> {
  const payload: Record<string, unknown> = {};
  if (fields.clawql_hitl !== undefined) {
    payload.clawql_hitl = fields.clawql_hitl;
  }
  return publishWorkflowEvent(
    buildWorkflowEvent("hitl.completed", fields.source ?? "hitl-label-studio-webhook", {
      correlation_id: fields.correlation_id,
      workflow_ref: fields.workflow_ref,
      payload: Object.keys(payload).length > 0 ? payload : undefined,
    })
  );
}

export async function publishWorkflowResumedEvent(fields: {
  correlation_id?: string;
  workflow_ref: HitlWorkflowRef;
  resumed_nodes: string[];
  workflow_level_resumed: boolean;
  source: string;
}): Promise<boolean> {
  return publishWorkflowEvent(
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

export async function publishWorkflowSuspendedEvent(fields: {
  correlation_id?: string;
  workflow_ref: HitlWorkflowRef;
  source: string;
}): Promise<boolean> {
  return publishWorkflowEvent(
    buildWorkflowEvent("workflow.suspended", fields.source, {
      correlation_id: fields.correlation_id,
      workflow_ref: fields.workflow_ref,
    })
  );
}

export async function publishConeshareViewerEvent(fields: {
  correlation_id?: string;
  event_type: string;
  share_link_id?: string;
  room_url?: string;
  viewer_email?: string;
}): Promise<boolean> {
  return publishDocumentEvent(
    buildDocumentEvent("coneshare.viewer", "coneshare-webhook", {
      correlation_id: fields.correlation_id,
      payload: {
        event_type: fields.event_type,
        share_link_id: fields.share_link_id,
        room_url: fields.room_url,
        viewer_email: fields.viewer_email,
      },
    })
  );
}

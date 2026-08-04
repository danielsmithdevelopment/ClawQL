/**
 * Document JetStream dispatch — IDP inbox → run_idp_pipeline, Coneshare → resume/notify.
 */

import { workflowToolEnabled } from "../workflow/env.js";
import {
  parseHitlWorkflowRef,
  resumeWorkflowFromHitlRef,
  type HitlWorkflowRef,
} from "../workflow/suspend-resume.js";
import type { DocumentEventEnvelope } from "./envelope.js";
import {
  natsConeshareNotifyChannel,
  natsConsumerConeshareFollowupEnabled,
  natsConsumerIdpPipelineEnabled,
  natsConsumerResumeWorkflowEnabled,
} from "./env.js";
import {
  publishDocumentPipelineHopEvent,
  publishDocumentPipelineTerminalEvent,
} from "./publish-hooks.js";

function workflowRefFromDocument(envelope: DocumentEventEnvelope): HitlWorkflowRef | undefined {
  if (envelope.workflow_ref?.namespace && envelope.workflow_ref?.name) {
    return envelope.workflow_ref;
  }
  if (envelope.payload?.clawql_share) {
    return parseHitlWorkflowRef(envelope.payload.clawql_share);
  }
  if (envelope.payload?.workflow) {
    return parseHitlWorkflowRef({ workflow: envelope.payload.workflow });
  }
  return undefined;
}

type PipelineRunResult = {
  ok: boolean;
  error?: string;
  completed_through?: number;
};

async function runIdpPipelineViaHttp(body: Record<string, unknown>): Promise<PipelineRunResult> {
  const base = process.env.CLAWQL_MCP_INTERNAL_URL?.trim().replace(/\/$/, "");
  if (!base) {
    return {
      ok: false,
      error:
        "IDP pipeline consumer needs documents execute deps (embedded MCP) or CLAWQL_MCP_INTERNAL_URL for POST /idp/pipeline/run",
    };
  }
  const token = process.env.CLAWQL_IDP_PIPELINE_RUN_TOKEN?.trim();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/idp/pipeline/run`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as PipelineRunResult & { error?: string };
  if (!res.ok) {
    return { ok: false, error: json.error ?? `HTTP ${res.status}` };
  }
  return {
    ok: json.ok === true,
    error: json.error,
    completed_through: json.completed_through,
  };
}

async function runIdpPipelineFromPayload(
  payload: Record<string, unknown> | undefined,
  correlation_id?: string
): Promise<PipelineRunResult> {
  const document_path =
    typeof payload?.document_path === "string" ? payload.document_path.trim() : "";
  if (!document_path) {
    return { ok: false, error: "document_path required" };
  }

  const input = {
    dry_run: payload?.dry_run === true,
    document_path,
    document_url: typeof payload?.document_url === "string" ? payload.document_url : undefined,
    processed_path:
      typeof payload?.processed_path === "string" ? payload.processed_path : undefined,
    redact_list: typeof payload?.redact_list === "string" ? payload.redact_list : undefined,
    correlation_id,
  };

  try {
    const { runIdpPipeline } = await import("clawql-documents");
    const { getDocumentsPluginDeps } = await import("clawql-documents/plugin");
    const deps = getDocumentsPluginDeps();
    const result = await runIdpPipeline(input, {
      execute: deps.execute,
      onHop: async (event) => {
        void publishDocumentPipelineHopEvent({
          correlation_id: event.correlation_id,
          hop: {
            index: event.hop.index,
            stage: event.hop.stage,
            operationId: event.hop.operationId,
            ok: event.hop.ok,
            skipped: event.hop.skipped,
            error: event.hop.error,
          },
        });
      },
    });
    void publishDocumentPipelineTerminalEvent({
      ok: result.ok,
      correlation_id,
      document_path,
      error: result.error,
      completed_through: result.completed_through,
    });
    return {
      ok: result.ok,
      error: result.error,
      completed_through: result.completed_through,
    };
  } catch {
    const viaHttp = await runIdpPipelineViaHttp(input);
    void publishDocumentPipelineTerminalEvent({
      ok: viaHttp.ok,
      correlation_id,
      document_path,
      error: viaHttp.error,
      completed_through: viaHttp.completed_through,
    });
    return viaHttp;
  }
}

/** Dispatch inbox / pipeline.requested → `run_idp_pipeline`. */
export async function dispatchDocumentInboxEvent(
  envelope: DocumentEventEnvelope
): Promise<{ ok: boolean; error?: string }> {
  if (!natsConsumerIdpPipelineEnabled()) {
    return { ok: true };
  }
  if (envelope.event_type !== "inbox.arrived" && envelope.event_type !== "pipeline.requested") {
    return { ok: false, error: `unexpected event_type: ${envelope.event_type}` };
  }
  const result = await runIdpPipelineFromPayload(envelope.payload, envelope.correlation_id);
  return { ok: result.ok, error: result.error };
}

async function maybeNotifyConeshare(envelope: DocumentEventEnvelope): Promise<void> {
  const channel = natsConeshareNotifyChannel();
  if (!channel) return;
  try {
    const { executeNotifySlackCore } = await import("../notify/notify.js");
    const viewer =
      typeof envelope.payload?.viewer_email === "string"
        ? envelope.payload.viewer_email
        : "anonymous";
    const share =
      typeof envelope.payload?.share_link_id === "string"
        ? envelope.payload.share_link_id
        : "(none)";
    const eventType =
      typeof envelope.payload?.event_type === "string"
        ? envelope.payload.event_type
        : envelope.event_type;
    await executeNotifySlackCore({
      channel,
      text: `ConeShare viewer activity: event=${eventType} share=${share} viewer=${viewer} correlation=${envelope.correlation_id ?? "(none)"}`,
    });
  } catch {
    /* optional notify */
  }
}

/** Dispatch Coneshare viewer events → optional Argo resume + Slack notify. */
export async function dispatchConeshareViewerEvent(
  envelope: DocumentEventEnvelope
): Promise<{ ok: boolean; error?: string }> {
  if (!natsConsumerConeshareFollowupEnabled()) {
    return { ok: true };
  }
  if (envelope.event_type !== "coneshare.viewer") {
    return { ok: false, error: `unexpected event_type: ${envelope.event_type}` };
  }

  await maybeNotifyConeshare(envelope);

  const ref = workflowRefFromDocument(envelope);
  if (!ref) {
    return { ok: true };
  }
  if (!natsConsumerResumeWorkflowEnabled() || !workflowToolEnabled()) {
    return { ok: true };
  }

  const hitlPayload = envelope.payload?.clawql_share ?? { workflow: ref };
  const result = await resumeWorkflowFromHitlRef(hitlPayload);
  if (!result.attempted) {
    return { ok: true };
  }
  if (result.ok) {
    return { ok: true };
  }
  const err = result.error ?? "resume failed";
  if (/no active suspend/i.test(err) || /already completed/i.test(err)) {
    return { ok: true };
  }
  return { ok: false, error: err };
}

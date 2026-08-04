/**
 * HITL bridge — Label Studio task enqueue + webhook ingestion ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).
 * Opt-in via **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**.
 */

import { getClawqlOptionalToolFlags } from "clawql-api";
import type { Request, Response } from "express";
import { publishHitlCompletedEvent } from "../nats/publish-hooks.js";
import { maybeResumeWorkflowFromHitl, parseHitlWorkflowRef } from "../workflow/suspend-resume.js";
import { getHitlWebhookDeps } from "./deps.js";

/**
 * Label Studio **prediction** object (pre-annotation) for import payloads ([#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247)).
 * Aligns with LS task/import shapes: `result` regions/choices + optional `model_version` / `score`.
 */
export type HitlLabelStudioPrediction = {
  /** Label Studio prediction `result` array (regions, choices, labels, …). */
  result: unknown[];
  /** Optional model identifier shown in the LS UI. */
  model_version?: string;
  /** Optional aggregate score in [0, 1]. */
  score?: number;
};

/** Soft limits for prediction payloads (keep import bodies bounded). */
export const HITL_PREDICTION_MAX_PER_TASK = 20;
export const HITL_PREDICTION_MAX_RESULT_ITEMS = 200;
export const HITL_PREDICTION_MAX_JSON_BYTES = 512_000;

export type HitlLabelStudioImportTask = {
  data: Record<string, unknown>;
  predictions?: HitlLabelStudioPrediction[];
};

export type HitlLabelStudioEnqueueParams = {
  /** Label Studio project primary key (integer). */
  project_id: number;
  /**
   * One or more tasks; each `data` object is stored under Label Studio `task.data`.
   * Optional **`predictions`** become Label Studio pre-annotations on import ([#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247)).
   */
  tasks: Array<{
    data: Record<string, unknown>;
    meta?: Record<string, unknown>;
    predictions?: HitlLabelStudioPrediction[];
  }>;
  /** Model / router confidence in [0, 1]; stored under `data.clawql_hitl.confidence` for reviewer context. */
  confidence?: number;
  /** Correlate with OpenClaw, Ouroboros seed, or logs. */
  correlation_id?: string;
  /** Optional Ouroboros / workflow lineage id. */
  seed_id?: string;
  /** When set, stored under `data.clawql_hitl.workflow` for webhook-driven Argo resume ([#254]). */
  workflow_ref?: {
    namespace: string;
    name: string;
    node_field_selector?: string;
  };
  /** Extra provenance (URLs, doc ids); merged into `data.clawql_hitl.provenance`. */
  provenance?: Record<string, unknown>;
};

/**
 * Validate optional `predictions` for one task. Returns a clear Error without echoing secrets.
 */
export function validateHitlPredictions(
  predictions: HitlLabelStudioPrediction[] | undefined,
  taskIndex: number
): Error | null {
  if (predictions === undefined) return null;
  if (!Array.isArray(predictions)) {
    return new Error(`tasks[${taskIndex}].predictions must be an array`);
  }
  if (predictions.length > HITL_PREDICTION_MAX_PER_TASK) {
    return new Error(
      `tasks[${taskIndex}].predictions exceeds max ${HITL_PREDICTION_MAX_PER_TASK} entries`
    );
  }
  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i];
    if (!p || typeof p !== "object" || !Array.isArray(p.result)) {
      return new Error(`tasks[${taskIndex}].predictions[${i}].result must be an array`);
    }
    if (p.result.length > HITL_PREDICTION_MAX_RESULT_ITEMS) {
      return new Error(
        `tasks[${taskIndex}].predictions[${i}].result exceeds max ${HITL_PREDICTION_MAX_RESULT_ITEMS} items`
      );
    }
    if (p.score !== undefined && (typeof p.score !== "number" || p.score < 0 || p.score > 1)) {
      return new Error(`tasks[${taskIndex}].predictions[${i}].score must be a number in [0, 1]`);
    }
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(predictions);
  } catch {
    return new Error(`tasks[${taskIndex}].predictions is not JSON-serializable`);
  }
  if (Buffer.byteLength(encoded, "utf8") > HITL_PREDICTION_MAX_JSON_BYTES) {
    return new Error(
      `tasks[${taskIndex}].predictions exceeds ${HITL_PREDICTION_MAX_JSON_BYTES} byte JSON limit`
    );
  }
  return null;
}

export function getHitlLabelStudioRestConfig(): {
  baseUrl: string;
  apiToken: string;
} | null {
  const baseUrl = process.env.CLAWQL_LABEL_STUDIO_URL?.trim();
  const apiToken = process.env.CLAWQL_LABEL_STUDIO_API_TOKEN?.trim();
  if (!baseUrl || !apiToken) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiToken };
}

/**
 * Build Label Studio import bodies: merge ClawQL HITL metadata into `data`,
 * and pass through optional **`predictions`** ([#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247)).
 * Throws when prediction payloads fail validation.
 */
export function mergeHitlMetadata(
  params: HitlLabelStudioEnqueueParams
): HitlLabelStudioImportTask[] {
  const enqueuedAt = new Date().toISOString();
  const hitl: Record<string, unknown> = {
    enqueued_at: enqueuedAt,
    source: "clawql_mcp",
  };
  if (params.confidence !== undefined) hitl.confidence = params.confidence;
  if (params.correlation_id?.trim()) hitl.correlation_id = params.correlation_id.trim();
  if (params.seed_id?.trim()) hitl.seed_id = params.seed_id.trim();
  if (params.workflow_ref) {
    hitl.workflow = {
      namespace: params.workflow_ref.namespace.trim(),
      name: params.workflow_ref.name.trim(),
      ...(params.workflow_ref.node_field_selector?.trim()
        ? { node_field_selector: params.workflow_ref.node_field_selector.trim() }
        : {}),
    };
  }
  if (params.provenance && Object.keys(params.provenance).length > 0) {
    hitl.provenance = params.provenance;
  }

  return params.tasks.map((t, taskIndex) => {
    const predErr = validateHitlPredictions(t.predictions, taskIndex);
    if (predErr) throw predErr;
    const out: HitlLabelStudioImportTask = {
      data: {
        ...t.data,
        ...(t.meta ? { meta: t.meta } : {}),
        clawql_hitl: hitl,
      },
    };
    if (t.predictions?.length) {
      out.predictions = t.predictions.map((p) => ({
        result: p.result,
        ...(p.model_version?.trim() ? { model_version: p.model_version.trim() } : {}),
        ...(p.score !== undefined ? { score: p.score } : {}),
      }));
    }
    return out;
  });
}

/**
 * POST `{base}/api/projects/{id}/import` with Label Studio token auth.
 */
export async function labelStudioImportTasks(
  baseUrl: string,
  apiToken: string,
  projectId: number,
  tasks: HitlLabelStudioImportTask[]
): Promise<
  { ok: true; status: number; body: unknown } | { ok: false; error: string; detail?: string }
> {
  const url = `${baseUrl}/api/projects/${projectId}/import`;
  let httpResponse: globalThis.Response;
  try {
    httpResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tasks),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Label Studio request failed: ${msg}` };
  }

  const text = await httpResponse.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!httpResponse.ok) {
    const detail = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    return {
      ok: false,
      error: `Label Studio returned HTTP ${httpResponse.status}`,
      detail: detail.slice(0, 8000),
    };
  }

  return { ok: true, status: httpResponse.status, body: parsed };
}

/** Promise façade over {@link executeHitlEnqueueLabelStudioEffect}. */
export async function handleHitlEnqueueLabelStudioToolInput(
  params: HitlLabelStudioEnqueueParams
): Promise<{ content: { type: "text"; text: string }[] }> {
  const { Effect } = await import("effect");
  const { executeHitlEnqueueLabelStudioEffect } = await import("../effect/hitl-enqueue-effect.js");
  return Effect.runPromise(executeHitlEnqueueLabelStudioEffect(params));
}

function getWebhookTokenExpected(): string | undefined {
  return process.env.CLAWQL_HITL_WEBHOOK_TOKEN?.trim();
}

/** Validate webhook caller when `CLAWQL_HITL_WEBHOOK_TOKEN` is set (recommended). */
export function hitlWebhookAuthOk(req: Request): boolean {
  const expected = getWebhookTokenExpected();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return false;
    }
    return true;
  }
  const auth = req.header("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const alt = req.header("x-clawql-hitl-token")?.trim();
  return bearer === expected || alt === expected;
}

function extractWebhookFields(body: unknown): {
  taskData?: Record<string, unknown>;
  correlationId?: string;
  annotation?: unknown;
  taskId?: unknown;
} {
  if (!body || typeof body !== "object") return {};
  const o = body as Record<string, unknown>;
  const task =
    o.task && typeof o.task === "object" ? (o.task as Record<string, unknown>) : undefined;
  const taskData =
    task?.data && typeof task.data === "object"
      ? (task.data as Record<string, unknown>)
      : undefined;
  const clawqlHitl =
    taskData?.clawql_hitl && typeof taskData.clawql_hitl === "object"
      ? (taskData.clawql_hitl as Record<string, unknown>)
      : undefined;
  const correlationId =
    typeof clawqlHitl?.correlation_id === "string" ? clawqlHitl.correlation_id : undefined;

  return {
    taskData,
    correlationId,
    annotation: o.annotation ?? (Array.isArray(o.annotations) ? o.annotations[0] : undefined),
    taskId: task?.id ?? o.task_id,
  };
}

/**
 * POST **`/hitl/label-studio/webhook`** — Label Studio project webhook target.
 * When vault memory is enabled and path is writable, records reviewer output via **`memory_ingest`**; otherwise **`audit`** append.
 */
export async function handleLabelStudioWebhookRequest(req: Request, res: Response): Promise<void> {
  const deps = getHitlWebhookDeps();
  if (!deps.enforceWebhookRateLimit(req, res)) return;
  if (!getWebhookTokenExpected() && process.env.NODE_ENV === "production") {
    res.status(503).json({
      ok: false,
      error: "Set CLAWQL_HITL_WEBHOOK_TOKEN for webhook ingestion in production.",
    });
    return;
  }
  if (!hitlWebhookAuthOk(req)) {
    res.status(401).json({ ok: false, error: "invalid or missing webhook token" });
    return;
  }

  const body = req.body;
  const { correlationId, taskId, taskData } = extractWebhookFields(body);
  const clawqlHitl =
    taskData?.clawql_hitl && typeof taskData.clawql_hitl === "object"
      ? taskData.clawql_hitl
      : undefined;

  const workflowResume = await maybeResumeWorkflowFromHitl(clawqlHitl);

  const workflowRef = clawqlHitl ? parseHitlWorkflowRef(clawqlHitl) : undefined;
  void publishHitlCompletedEvent({
    correlation_id: correlationId,
    workflow_ref: workflowRef,
    clawql_hitl: clawqlHitl,
  });

  const flags = getClawqlOptionalToolFlags();
  const vault = deps.getObsidianVaultPath();

  const insightsParts = [
    "## Summary",
    "",
    "Label Studio webhook received — human review artifact (see toolOutputs for raw payload).",
    "",
    `- **task id:** ${taskId !== undefined ? String(taskId) : "(unknown)"}`,
    `- **correlation_id:** ${correlationId ?? "(none)"}`,
    "",
  ];

  const insights = insightsParts.join("\n");
  const rawPayload = JSON.stringify(body, null, 2);
  const truncated =
    rawPayload.length > 120_000 ? `${rawPayload.slice(0, 120_000)}\n… (truncated)` : rawPayload;

  if (flags.enableMemory && vault) {
    const mem = await deps.handleMemoryIngest({
      title: "HITL Label Studio review",
      insights,
      sessionId: correlationId,
      append: true,
      toolOutputs: [`## Webhook payload\n\n\`\`\`json\n${truncated}\n\`\`\``],
    });
    const text = mem.content[0]?.text ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    res.status(200).json({
      ok: true,
      durable: "memory_ingest",
      result: parsed,
      workflow_resume: workflowResume.attempted ? workflowResume : undefined,
    });
    return;
  }

  await deps.handleAudit({
    operation: "append",
    category: "hitl",
    action: "label_studio_webhook",
    summary: `task=${String(taskId)} correlation=${correlationId ?? "none"} annotation_bytes=${truncated.length}${workflowResume.attempted ? ` workflow_resume_ok=${workflowResume.ok}` : ""}`,
    correlationId,
  });

  res.status(200).json({
    ok: true,
    durable: "audit",
    note: "memory_ingest skipped (memory off or vault missing); recorded to audit ring buffer only",
    workflow_resume: workflowResume.attempted ? workflowResume : undefined,
  });
}

export { configureHitlWebhookDeps, resetHitlWebhookDepsForTests } from "./deps.js";

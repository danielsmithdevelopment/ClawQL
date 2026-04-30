/**
 * HITL bridge — Label Studio task enqueue + webhook ingestion ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).
 * Opt-in via **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**.
 */

import type { Request, Response } from "express";
import { handleAuditToolInput } from "./clawql-audit.js";
import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";
import { handleMemoryIngestToolInput } from "./memory-ingest.js";
import { getObsidianVaultPath } from "./vault-config.js";

export type HitlLabelStudioEnqueueParams = {
  /** Label Studio project primary key (integer). */
  project_id: number;
  /** One or more tasks; each `data` object is stored under Label Studio `task.data`. */
  tasks: Array<{ data: Record<string, unknown>; meta?: Record<string, unknown> }>;
  /** Model / router confidence in [0, 1]; stored under `data.clawql_hitl.confidence` for reviewer context. */
  confidence?: number;
  /** Correlate with OpenClaw, Ouroboros seed, or logs. */
  correlation_id?: string;
  /** Optional Ouroboros / workflow lineage id. */
  seed_id?: string;
  /** Extra provenance (URLs, doc ids); merged into `data.clawql_hitl.provenance`. */
  provenance?: Record<string, unknown>;
};

export function getHitlLabelStudioRestConfig(): {
  baseUrl: string;
  apiToken: string;
} | null {
  const baseUrl = process.env.CLAWQL_LABEL_STUDIO_URL?.trim();
  const apiToken = process.env.CLAWQL_LABEL_STUDIO_API_TOKEN?.trim();
  if (!baseUrl || !apiToken) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiToken };
}

function mergeHitlMetadata(
  params: HitlLabelStudioEnqueueParams
): Array<{ data: Record<string, unknown> }> {
  const enqueuedAt = new Date().toISOString();
  const hitl: Record<string, unknown> = {
    enqueued_at: enqueuedAt,
    source: "clawql_mcp",
  };
  if (params.confidence !== undefined) hitl.confidence = params.confidence;
  if (params.correlation_id?.trim()) hitl.correlation_id = params.correlation_id.trim();
  if (params.seed_id?.trim()) hitl.seed_id = params.seed_id.trim();
  if (params.provenance && Object.keys(params.provenance).length > 0) {
    hitl.provenance = params.provenance;
  }

  return params.tasks.map((t) => ({
    data: {
      ...t.data,
      ...(t.meta ? { meta: t.meta } : {}),
      clawql_hitl: hitl,
    },
  }));
}

/**
 * POST `{base}/api/projects/{id}/import` with Label Studio token auth.
 */
export async function labelStudioImportTasks(
  baseUrl: string,
  apiToken: string,
  projectId: number,
  tasks: Array<{ data: Record<string, unknown> }>
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

export async function handleHitlEnqueueLabelStudioToolInput(
  params: HitlLabelStudioEnqueueParams
): Promise<{ content: { type: "text"; text: string }[] }> {
  const cfg = getHitlLabelStudioRestConfig();
  if (!cfg) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error:
              "Label Studio is not configured. Set CLAWQL_LABEL_STUDIO_URL and CLAWQL_LABEL_STUDIO_API_TOKEN.",
          }),
        },
      ],
    };
  }

  if (!Number.isFinite(params.project_id) || params.project_id < 1) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "`project_id` must be a positive integer." }),
        },
      ],
    };
  }

  if (!params.tasks?.length) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "`tasks` must be a non-empty array." }),
        },
      ],
    };
  }

  const payload = mergeHitlMetadata(params);
  const result = await labelStudioImportTasks(
    cfg.baseUrl,
    cfg.apiToken,
    params.project_id,
    payload
  );

  if (!result.ok) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: false,
            error: result.error,
            detail: result.detail,
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ok: true,
            project_id: params.project_id,
            task_count: payload.length,
            label_studio_response: result.body,
          },
          null,
          2
        ),
      },
    ],
  };
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
  const { correlationId, taskId } = extractWebhookFields(body);

  const flags = getClawqlOptionalToolFlags();
  const vault = getObsidianVaultPath();

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
    const mem = await handleMemoryIngestToolInput({
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
    res.status(200).json({ ok: true, durable: "memory_ingest", result: parsed });
    return;
  }

  await handleAuditToolInput({
    operation: "append",
    category: "hitl",
    action: "label_studio_webhook",
    summary: `task=${String(taskId)} correlation=${correlationId ?? "none"} annotation_bytes=${truncated.length}`,
    correlationId,
  });

  res.status(200).json({
    ok: true,
    durable: "audit",
    note: "memory_ingest skipped (memory off or vault missing); recorded to audit ring buffer only",
  });
}

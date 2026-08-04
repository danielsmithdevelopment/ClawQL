/**
 * Nextcloud inbox webhook → NATS `clawql.document.inbox.arrived` (background IDP queue).
 * Opt-in via **`CLAWQL_ENABLE_NEXTCLOUD_WEBHOOK=1`** (or documents + Nextcloud base URL).
 * Configure Nextcloud Flow / external script to POST **`POST /idp/nextcloud/webhook`**.
 */

import type { Request, Response } from "express";
import { handleAuditToolInput } from "./clawql-audit.js";
import { getClawqlOptionalToolFlags } from "clawql-api";
import { handleMemoryIngestToolInput } from "./memory-ingest.js";
import { getObsidianVaultPath } from "./vault-config.js";
import { publishDocumentInboxArrivedEvent } from "clawql-automation/nats/publish-hooks";

function webhookTokenExpected(): string | undefined {
  const t = process.env.CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN?.trim();
  return t && t.length > 0 ? t : undefined;
}

function webhookEnabled(): boolean {
  const raw = process.env.CLAWQL_ENABLE_NEXTCLOUD_WEBHOOK?.trim();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  // Default on when Nextcloud is configured and documents are enabled.
  return Boolean(process.env.NEXTCLOUD_BASE_URL?.trim());
}

function webhookAuthOk(req: Request): boolean {
  const expected = webhookTokenExpected();
  if (!expected) return process.env.NODE_ENV !== "production";
  const header =
    req
      .header("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? req.header("x-nextcloud-webhook-token")?.trim();
  return header === expected;
}

function extractInboxEvent(body: unknown): {
  documentPath?: string;
  documentUrl?: string;
  processedPath?: string;
  redactList?: string;
  correlationId?: string;
  dryRun?: boolean;
} {
  if (!body || typeof body !== "object") return {};
  const row = body as Record<string, unknown>;
  const documentPath =
    (typeof row.document_path === "string" && row.document_path) ||
    (typeof row.path === "string" && row.path) ||
    (typeof row.filePath === "string" && row.filePath) ||
    undefined;
  const documentUrl =
    typeof row.document_url === "string"
      ? row.document_url
      : typeof row.url === "string"
        ? row.url
        : undefined;
  const processedPath = typeof row.processed_path === "string" ? row.processed_path : undefined;
  const redactList = typeof row.redact_list === "string" ? row.redact_list : undefined;
  const correlationId =
    typeof row.correlation_id === "string"
      ? row.correlation_id
      : typeof row.correlationId === "string"
        ? row.correlationId
        : undefined;
  const dryRun = row.dry_run === true || row.dryRun === true;
  return { documentPath, documentUrl, processedPath, redactList, correlationId, dryRun };
}

/** POST **`/idp/nextcloud/webhook`** — enqueue IDP pipeline via NATS. */
export async function handleNextcloudWebhookRequest(req: Request, res: Response): Promise<void> {
  if (!webhookEnabled()) {
    res.status(404).json({ ok: false, error: "Nextcloud webhook disabled" });
    return;
  }
  if (!webhookTokenExpected() && process.env.NODE_ENV === "production") {
    res.status(503).json({
      ok: false,
      error: "Set CLAWQL_NEXTCLOUD_WEBHOOK_TOKEN for webhook ingestion in production.",
    });
    return;
  }
  if (!webhookAuthOk(req)) {
    res.status(401).json({ ok: false, error: "invalid or missing webhook token" });
    return;
  }

  const extracted = extractInboxEvent(req.body);
  if (!extracted.documentPath?.trim()) {
    res.status(400).json({ ok: false, error: "document_path (or path) is required" });
    return;
  }

  const published = await publishDocumentInboxArrivedEvent({
    correlation_id: extracted.correlationId,
    document_path: extracted.documentPath.trim(),
    document_url: extracted.documentUrl,
    processed_path: extracted.processedPath,
    redact_list: extracted.redactList,
    dry_run: extracted.dryRun,
    source: "nextcloud-webhook",
  });

  const flags = getClawqlOptionalToolFlags();
  const vault = getObsidianVaultPath();
  const insights = [
    "## Summary",
    "",
    "Nextcloud inbox webhook — published `clawql.document.inbox.arrived` for NATS IDP consumer.",
    "",
    `- **document_path:** ${extracted.documentPath}`,
    `- **correlation_id:** ${extracted.correlationId ?? "(none)"}`,
    `- **nats_published:** ${published}`,
    "",
  ].join("\n");

  if (flags.enableMemory && vault) {
    const mem = await handleMemoryIngestToolInput({
      title: "Nextcloud IDP inbox webhook",
      insights,
      append: true,
      sessionId: extracted.correlationId,
      toolOutputs: [
        `## Webhook payload\n\n\`\`\`json\n${JSON.stringify(req.body, null, 2).slice(0, 80_000)}\n\`\`\``,
      ],
    });
    const text = mem.content[0]?.text ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    res
      .status(200)
      .json({ ok: true, durable: "memory_ingest", nats_published: published, result: parsed });
    return;
  }

  await handleAuditToolInput({
    operation: "append",
    category: "idp",
    action: "nextcloud_webhook",
    summary: `path=${extracted.documentPath} nats=${published}`,
  });
  res.status(200).json({ ok: true, durable: "audit", nats_published: published });
}

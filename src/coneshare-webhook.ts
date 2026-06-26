/**
 * ConeShare viewer / share webhook ingestion ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)).
 * Opt-in via **`CLAWQL_ENABLE_CONESHARE=1`**. Configure ConeShare automations to POST to
 * **`POST /idp/coneshare/webhook`** on the MCP HTTP server.
 */

import type { Request, Response } from "express";
import { handleAuditToolInput } from "./clawql-audit.js";
import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";
import { handleMemoryIngestToolInput } from "./memory-ingest.js";
import { getObsidianVaultPath } from "./vault-config.js";

function webhookTokenExpected(): string | undefined {
  const t = process.env.CLAWQL_CONESHARE_WEBHOOK_TOKEN?.trim();
  return t && t.length > 0 ? t : undefined;
}

function webhookAuthOk(req: Request): boolean {
  const expected = webhookTokenExpected();
  if (!expected) return process.env.NODE_ENV !== "production";
  const header =
    req
      .header("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? req.header("x-coneshare-webhook-token")?.trim();
  return header === expected;
}

function extractConeshareEvent(body: unknown): {
  eventType: string;
  shareLinkId?: string;
  roomUrl?: string;
  viewerEmail?: string;
} {
  if (!body || typeof body !== "object") {
    return { eventType: "unknown" };
  }
  const row = body as Record<string, unknown>;
  const eventType =
    (typeof row.event === "string" && row.event) ||
    (typeof row.event_type === "string" && row.event_type) ||
    (typeof row.type === "string" && row.type) ||
    "coneshare_event";
  const shareLinkId =
    typeof row.share_link_id === "string"
      ? row.share_link_id
      : typeof row.shareLinkId === "string"
        ? row.shareLinkId
        : undefined;
  const roomUrl =
    typeof row.room_url === "string"
      ? row.room_url
      : typeof row.public_url === "string"
        ? row.public_url
        : undefined;
  const viewerEmail =
    typeof row.viewer_email === "string"
      ? row.viewer_email
      : typeof row.email === "string"
        ? row.email
        : undefined;
  return { eventType, shareLinkId, roomUrl, viewerEmail };
}

/** POST **`/idp/coneshare/webhook`** — ConeShare automation / analytics callback. */
export async function handleConeshareWebhookRequest(req: Request, res: Response): Promise<void> {
  if (!webhookTokenExpected() && process.env.NODE_ENV === "production") {
    res.status(503).json({
      ok: false,
      error: "Set CLAWQL_CONESHARE_WEBHOOK_TOKEN for webhook ingestion in production.",
    });
    return;
  }
  if (!webhookAuthOk(req)) {
    res.status(401).json({ ok: false, error: "invalid or missing webhook token" });
    return;
  }

  const body = req.body;
  const { eventType, shareLinkId, roomUrl, viewerEmail } = extractConeshareEvent(body);
  const flags = getClawqlOptionalToolFlags();
  const vault = getObsidianVaultPath();

  const insights = [
    "## Summary",
    "",
    "ConeShare webhook received — viewer/share analytics for IDP follow-up.",
    "",
    `- **event:** ${eventType}`,
    `- **share_link_id:** ${shareLinkId ?? "(none)"}`,
    `- **room_url:** ${roomUrl ?? "(none)"}`,
    `- **viewer:** ${viewerEmail ?? "(anonymous)"}`,
    "",
  ].join("\n");

  const rawPayload = JSON.stringify(body, null, 2);
  const truncated =
    rawPayload.length > 120_000 ? `${rawPayload.slice(0, 120_000)}\n… (truncated)` : rawPayload;

  if (flags.enableMemory && vault) {
    const mem = await handleMemoryIngestToolInput({
      title: "ConeShare IDP webhook",
      insights,
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
    category: "idp",
    action: "coneshare_webhook",
    summary: `event=${eventType} share=${shareLinkId ?? "none"} viewer=${viewerEmail ?? "none"}`,
  });
  res.status(200).json({ ok: true, durable: "audit" });
}

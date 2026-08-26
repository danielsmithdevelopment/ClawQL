/**
 * Langfuse eval webhook → Ouroboros seed revision ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)).
 * Opt-in via **`CLAWQL_ENABLE_LANGFUSE_EVAL=1`** (Ouroboros lineage is always available via clawql-harness).
 */

import type { Request, Response } from "express";
import {
  langfuseEvalAutoApplyEnabled,
  loadLatestSeedFromLineage,
  normalizeLangfuseEvalPayload,
  parseLangfuseMinScore,
  processLangfuseEval,
} from "clawql-ouroboros/eval";
import { getOuroborosContext } from "clawql-ouroboros/plugin";
import { handleAuditToolInput } from "./clawql-audit.js";
import { resolvePluginCompositionFlags } from "./resolve-plugin-flags.js";
import { handleMemoryIngestToolInput } from "./memory-ingest.js";
import { getObsidianVaultPath } from "./vault-config.js";
import { enforceWebhookRateLimit } from "./webhook-rate-limit.js";

function webhookTokenExpected(): string | undefined {
  const t = process.env.CLAWQL_LANGFUSE_WEBHOOK_TOKEN?.trim();
  return t && t.length > 0 ? t : undefined;
}

function webhookAuthOk(req: Request): boolean {
  const expected = webhookTokenExpected();
  if (!expected) return process.env.NODE_ENV !== "production";
  const header =
    req
      .header("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? req.header("x-langfuse-webhook-token")?.trim();
  return header === expected;
}

/** POST **`/observability/langfuse/webhook`** — Langfuse score / trace callback. */
export async function handleLangfuseEvalWebhookRequest(req: Request, res: Response): Promise<void> {
  if (!enforceWebhookRateLimit(req, res)) return;
  if (!webhookTokenExpected() && process.env.NODE_ENV === "production") {
    res.status(503).json({
      ok: false,
      error: "Set CLAWQL_LANGFUSE_WEBHOOK_TOKEN for webhook ingestion in production.",
    });
    return;
  }
  if (!webhookAuthOk(req)) {
    res.status(401).json({ ok: false, error: "invalid or missing webhook token" });
    return;
  }

  const flags = resolvePluginCompositionFlags();
  if (!flags.enableLangfuseEval) {
    res.status(503).json({
      ok: false,
      error: "Enable ouroboros.langfuseEval in ClawQLInstance / CLAWQL_INSTANCE_SPEC for Langfuse eval → seed revision.",
    });
    return;
  }

  const body = req.body;
  const evalEvent = normalizeLangfuseEvalPayload(body);
  if (!evalEvent) {
    res.status(400).json({ ok: false, error: "payload missing numeric score value" });
    return;
  }

  const { eventStore } = getOuroborosContext();
  const result = await processLangfuseEval(evalEvent, {
    minScore: parseLangfuseMinScore(process.env),
    autoApply: langfuseEvalAutoApplyEnabled(process.env),
    eventStore,
    loadSeedByLineageId: async (seedId) => loadLatestSeedFromLineage(eventStore, seedId),
  });

  const vault = getObsidianVaultPath();
  const insights = [
    "## Summary",
    "",
    "Langfuse eval webhook processed — Ouroboros seed revision gate.",
    "",
    `- **action:** ${result.action}`,
    `- **score:** ${result.scoreName}=${result.scoreValue} (min ${result.minScore})`,
    `- **dry_run:** ${result.dryRun}`,
    `- **seed_id:** ${result.seedId ?? "(none)"}`,
    `- **trace_id:** ${result.traceId ?? "(none)"}`,
    `- **reason:** ${result.reason}`,
    "",
  ].join("\n");

  const rawPayload = JSON.stringify(body, null, 2);
  const truncated =
    rawPayload.length > 120_000 ? `${rawPayload.slice(0, 120_000)}\n… (truncated)` : rawPayload;

  if (flags.enableMemory && vault) {
    const mem = await handleMemoryIngestToolInput({
      title: "Langfuse eval → Ouroboros",
      insights,
      sessionId: result.correlationId,
      append: true,
      toolOutputs: [
        `## Webhook payload\n\n\`\`\`json\n${truncated}\n\`\`\``,
        `## Result\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
      ],
    });
    const text = mem.content[0]?.text ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    res.status(200).json({ ok: true, durable: "memory_ingest", result, vault: parsed });
    return;
  }

  await handleAuditToolInput({
    operation: "append",
    category: "ouroboros",
    action: "langfuse_eval_webhook",
    summary: `action=${result.action} score=${result.scoreName}=${result.scoreValue} seed=${result.seedId ?? "none"}`,
    correlationId: result.correlationId,
  });
  res.status(200).json({ ok: true, durable: "audit", result });
}

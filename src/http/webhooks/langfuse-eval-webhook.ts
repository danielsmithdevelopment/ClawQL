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
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { handleMemoryIngestToolInput } from "clawql-memory/plugin";
import { handleAuditToolInput } from "../../mcp/clawql-audit.js";
import { resolvePluginCompositionFlags } from "../../composition/resolve-plugin-flags.js";
import { enforceWebhookRateLimit } from "./webhook-rate-limit.js";
import { bearerFromRequest, checkWebhookToken } from "./webhook-token-auth.js";

/** POST **`/observability/langfuse/webhook`** — Langfuse score / trace callback. */
export async function handleLangfuseEvalWebhookRequest(req: Request, res: Response): Promise<void> {
  if (!enforceWebhookRateLimit(req, res)) return;
  const auth = checkWebhookToken({
    expectedEnvName: "CLAWQL_LANGFUSE_WEBHOOK_TOKEN",
    presented: bearerFromRequest(req, "x-langfuse-webhook-token"),
  });
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const flags = resolvePluginCompositionFlags();
  if (!flags.enableLangfuseEval) {
    res.status(503).json({
      ok: false,
      error:
        "Enable ouroboros.langfuseEval in ClawQLInstance / CLAWQL_INSTANCE_SPEC for Langfuse eval → seed revision.",
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

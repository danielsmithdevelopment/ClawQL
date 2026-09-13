/**
 * Wire HITL webhook handlers to clawql-mcp transport (audit, memory ingest, vault, rate limit).
 */

import { configureHitlWebhookDeps } from "clawql-automation/hitl/label-studio";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { handleMemoryIngestToolInput } from "clawql-memory/plugin";
import { handleAuditToolInput } from "../mcp/clawql-audit.js";
import { enforceWebhookRateLimit } from "./webhooks/webhook-rate-limit.js";

export function configureHitlTransportDeps(): void {
  configureHitlWebhookDeps({
    enforceWebhookRateLimit,
    getObsidianVaultPath: () => getObsidianVaultPath() ?? undefined,
    handleMemoryIngest: handleMemoryIngestToolInput,
    handleAudit: async (params) => {
      await handleAuditToolInput(params);
    },
  });
}

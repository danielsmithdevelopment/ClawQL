/**
 * Wire HITL webhook handlers to clawql-mcp transport (audit, memory ingest, vault, rate limit).
 */

import { configureHitlWebhookDeps } from "clawql-automation/hitl/label-studio";
import { handleAuditToolInput } from "./clawql-audit.js";
import { handleMemoryIngestToolInput } from "./memory-ingest.js";
import { getObsidianVaultPath } from "./vault-config.js";
import { enforceWebhookRateLimit } from "./webhook-rate-limit.js";

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

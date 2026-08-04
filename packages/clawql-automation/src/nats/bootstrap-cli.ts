#!/usr/bin/env node
/**
 * Ensure JetStream stream + durable consumers exist (for KEDA metrics / scale-from-zero).
 * Usage: node dist/nats/bootstrap-cli.js
 */

import {
  ensureConeshareFollowupConsumer,
  ensureHitlResumeConsumer,
  ensureIdpPipelineConsumer,
} from "./client.js";
import {
  natsConeshareFollowupConsumerDurable,
  natsConsumerConeshareFollowupEnabled,
  natsConsumerIdpPipelineEnabled,
  natsConsumerResumeWorkflowEnabled,
  natsHitlResumeConsumerDurable,
  natsIdpPipelineConsumerDurable,
  natsStreamName,
} from "./env.js";

async function main(): Promise<void> {
  const created: string[] = [];
  if (natsConsumerResumeWorkflowEnabled()) {
    await ensureHitlResumeConsumer();
    created.push(natsHitlResumeConsumerDurable());
  }
  if (natsConsumerIdpPipelineEnabled()) {
    await ensureIdpPipelineConsumer();
    created.push(natsIdpPipelineConsumerDurable());
  }
  if (natsConsumerConeshareFollowupEnabled()) {
    await ensureConeshareFollowupConsumer();
    created.push(natsConeshareFollowupConsumerDurable());
  }
  if (created.length === 0) {
    // Default: bootstrap HITL durable for backward compatibility with KEDA charts.
    await ensureHitlResumeConsumer();
    created.push(natsHitlResumeConsumerDurable());
  }
  console.log(
    JSON.stringify({
      ok: true,
      stream: natsStreamName(),
      consumers: created,
    })
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

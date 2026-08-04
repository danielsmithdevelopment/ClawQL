#!/usr/bin/env node
/**
 * Standalone NATS JetStream consumer worker ([#257](https://github.com/danielsmithdevelopment/ClawQL/issues/257)).
 * Handles HITL resume and/or document consumers (IDP pipeline + Coneshare follow-up).
 *
 * Usage: node dist/nats/cli.js
 */

import {
  natsConfiguredForConsumer,
  natsConsumerConeshareFollowupEnabled,
  natsConsumerIdpPipelineEnabled,
  natsHitlConsumerConfigured,
} from "./env.js";
import { dispatchHitlCompletedEvent } from "./dispatch.js";
import { dispatchConeshareViewerEvent, dispatchDocumentInboxEvent } from "./dispatch-document.js";
import {
  startConeshareFollowupConsumer,
  startHitlCompletedConsumer,
  startIdpPipelineConsumer,
  stopNatsClient,
} from "./client.js";

async function shutdown(): Promise<void> {
  await stopNatsClient();
  process.exit(0);
}

async function main(): Promise<void> {
  if (!natsConfiguredForConsumer()) {
    console.error(
      "NATS consumer worker requires CLAWQL_NATS_URL, CLAWQL_NATS_JETSTREAM=1, " +
        "CLAWQL_NATS_ENABLE_CONSUMER=1, and at least one of: " +
        "CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW=1, CLAWQL_NATS_CONSUMER_IDP_PIPELINE=1, " +
        "CLAWQL_NATS_CONSUMER_CONESHARE_FOLLOWUP=1"
    );
    process.exitCode = 1;
    return;
  }

  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });

  console.log(
    JSON.stringify({
      ok: true,
      message: "nats consumer worker starting",
      hitl: natsHitlConsumerConfigured(),
      idp_pipeline: natsConsumerIdpPipelineEnabled(),
      coneshare_followup: natsConsumerConeshareFollowupEnabled(),
    })
  );

  const loops: Promise<void>[] = [];
  if (natsHitlConsumerConfigured()) {
    loops.push(startHitlCompletedConsumer(dispatchHitlCompletedEvent));
  }
  if (natsConsumerIdpPipelineEnabled()) {
    loops.push(startIdpPipelineConsumer(dispatchDocumentInboxEvent));
  }
  if (natsConsumerConeshareFollowupEnabled()) {
    loops.push(startConeshareFollowupConsumer(dispatchConeshareViewerEvent));
  }
  await Promise.all(loops);
  await shutdown();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

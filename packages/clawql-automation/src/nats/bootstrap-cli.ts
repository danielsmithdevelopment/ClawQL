#!/usr/bin/env node
/**
 * Ensure JetStream stream + HITL resume durable consumer exist (for KEDA metrics / scale-from-zero).
 * Usage: node dist/nats/bootstrap-cli.js
 */

import { ensureHitlResumeConsumer } from "./client.js";

async function main(): Promise<void> {
  await ensureHitlResumeConsumer();
  console.log(
    JSON.stringify({
      ok: true,
      stream: process.env.CLAWQL_NATS_STREAM_WORKFLOW?.trim() || "CLAWQL_WORKFLOW",
      consumer: process.env.CLAWQL_NATS_CONSUMER_DURABLE?.trim() || "clawql-hitl-resume",
    })
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

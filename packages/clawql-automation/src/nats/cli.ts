#!/usr/bin/env node
/**
 * Standalone NATS JetStream consumer worker ([#257](https://github.com/danielsmithdevelopment/ClawQL/issues/257)).
 * Run in a dedicated Deployment scaled by KEDA on consumer lag.
 *
 * Usage: node dist/nats/cli.js
 */

import { natsConfiguredForConsumer } from "./env.js";
import { dispatchHitlCompletedEvent } from "./dispatch.js";
import { startHitlCompletedConsumer, stopNatsClient } from "./client.js";

async function shutdown(): Promise<void> {
  await stopNatsClient();
  process.exit(0);
}

async function main(): Promise<void> {
  if (!natsConfiguredForConsumer()) {
    console.error(
      "NATS consumer worker requires CLAWQL_NATS_URL, CLAWQL_NATS_JETSTREAM=1, " +
        "CLAWQL_NATS_ENABLE_CONSUMER=1, and CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW=1"
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

  console.log(JSON.stringify({ ok: true, message: "nats consumer worker starting" }));
  await startHitlCompletedConsumer(dispatchHitlCompletedEvent);
  await shutdown();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

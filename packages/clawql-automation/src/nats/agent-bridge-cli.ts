#!/usr/bin/env node
/**
 * IDP NATS → MCP agent bridge CLI ([#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)).
 *
 * Usage:
 *   CLAWQL_NATS_URL=nats://localhost:4222 \
 *   CLAWQL_NATS_JETSTREAM=1 \
 *   CLAWQL_NATS_ENABLE_CONSUMER=1 \
 *   CLAWQL_NATS_AGENT_BRIDGE=1 \
 *   CLAWQL_MCP_HTTP_URL=http://127.0.0.1:8080/mcp \
 *   npm run nats:agent-bridge
 */

import { natsAgentBridgeConfigured } from "./env.js";
import { startIdpAgentBridgeConsumer } from "./agent-bridge.js";
import { createStreamableHttpMcpCaller } from "./agent-bridge-mcp.js";
import { stopNatsClient } from "./client.js";

async function shutdown(closeMcp?: () => Promise<void>): Promise<void> {
  if (closeMcp) await closeMcp();
  await stopNatsClient();
  process.exit(0);
}

async function main(): Promise<void> {
  if (!natsAgentBridgeConfigured()) {
    console.error(
      "IDP agent bridge requires CLAWQL_NATS_URL, CLAWQL_NATS_JETSTREAM=1, " +
        "CLAWQL_NATS_ENABLE_CONSUMER=1, and CLAWQL_NATS_AGENT_BRIDGE=1"
    );
    process.exitCode = 1;
    return;
  }

  const { caller, close } = await createStreamableHttpMcpCaller();
  process.on("SIGTERM", () => {
    void shutdown(close);
  });
  process.on("SIGINT", () => {
    void shutdown(close);
  });

  console.log(
    JSON.stringify({
      ok: true,
      message: "idp nats agent bridge starting",
      mcp:
        process.env.CLAWQL_MCP_HTTP_URL ||
        process.env.CLAWQL_MCP_URL ||
        "http://127.0.0.1:8080/mcp",
    })
  );

  await startIdpAgentBridgeConsumer(caller);
  await shutdown(close);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * NATS queue-group assigner for chaos scale-out benches.
 *
 * Each gateway replica runs one of these. Clients request `clawql.chaos.assign`
 * and a single member of queue group `clawql-chaos-assign` responds with this
 * replica's Streamable HTTP base URL (sticky session pinning).
 *
 * Mirrors the fabric pattern: NATS queue groups distribute work; clients do not
 * talk to NATS for data plane (MCP stays on HTTP).
 *
 * Env:
 *   CLAWQL_NATS_URL (required)
 *   CHAOS_WORKER_BASE_URL (required) e.g. http://127.0.0.1:18001
 *   CHAOS_ASSIGN_SUBJECT (default clawql.chaos.assign)
 *   CHAOS_ASSIGN_QUEUE (default clawql-chaos-assign)
 */
import { connect, StringCodec } from "nats";

const url = process.env.CLAWQL_NATS_URL?.trim();
const baseUrl = process.env.CHAOS_WORKER_BASE_URL?.trim();
const subject = process.env.CHAOS_ASSIGN_SUBJECT?.trim() || "clawql.chaos.assign";
const queue = process.env.CHAOS_ASSIGN_QUEUE?.trim() || "clawql-chaos-assign";

if (!url || !baseUrl) {
  console.error("[nats-chaos-assign] CLAWQL_NATS_URL and CHAOS_WORKER_BASE_URL required");
  process.exit(1);
}

const sc = StringCodec();
const nc = await connect({ servers: url });
const sub = nc.subscribe(subject, { queue });
console.error(`[nats-chaos-assign] ready base=${baseUrl} subject=${subject} queue=${queue}`);

const payload = sc.encode(JSON.stringify({ baseUrl, pid: process.pid }));
(async () => {
  for await (const msg of sub) {
    try {
      msg.respond(payload);
    } catch (err) {
      console.error("[nats-chaos-assign] respond failed:", err);
    }
  }
})().catch((err) => {
  console.error("[nats-chaos-assign] loop error:", err);
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    nc.close().finally(() => process.exit(0));
  });
}

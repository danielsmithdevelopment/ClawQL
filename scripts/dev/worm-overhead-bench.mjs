/**
 * Microbench: process WORM append overhead (memory dual-ack vs disabled).
 * Publish numbers into 8.0.0 release notes after measuring on a quiet host.
 */
import { Effect } from "effect";
import {
  bootProcessWormFromEnvEffect,
  appendProcessWormEffect,
  resetProcessWormForTests,
} from "../../packages/clawql-audit/dist/index.js";

async function bench(label, enabled, n) {
  await Effect.runPromise(resetProcessWormForTests());
  process.env.CLAWQL_WORM_ENABLED = enabled ? "1" : "0";
  process.env.CLAWQL_WORM_LOCAL = "memory";
  process.env.CLAWQL_WORM_REMOTE = "memory";
  process.env.CLAWQL_WORM_SESSION_ID = "bench";
  process.env.CLAWQL_WORM_RECONCILE_MS = "0";
  await Effect.runPromise(
    bootProcessWormFromEnvEffect().pipe(Effect.catch(() => Effect.succeed(null))),
  );
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    await Effect.runPromise(
      appendProcessWormEffect({
        type: "SESSION_START",
        timestamp: new Date().toISOString(),
        sessionId: "bench",
        metadata: { i },
      }),
    );
  }
  const ms = performance.now() - t0;
  const row = {
    label,
    enabled,
    n,
    totalMs: +ms.toFixed(2),
    perAppendUs: +((ms / n) * 1000).toFixed(1),
  };
  console.log(JSON.stringify(row));
  await Effect.runPromise(resetProcessWormForTests());
  return row;
}

const n = Number(process.env.WORM_BENCH_N || 500);
const off = await bench("worm-off", false, n);
const on = await bench("worm-memory-dual", true, n);
console.log(
  JSON.stringify({
    summary: "memory dual-ack process WORM vs disabled",
    n,
    offUs: off.perAppendUs,
    onUs: on.perAppendUs,
    overheadUs: +(on.perAppendUs - off.perAppendUs).toFixed(1),
    note: "In-process memory backends only; SQLite/S3 Object Lock will be higher.",
  }),
);

#!/usr/bin/env npx tsx
/**
 * Microbench for Effect v4 Schema decode on the MCP search/execute hot path.
 * Not a substitute for a loaded gateway p95. Prints p50/p95 of N iterations.
 *
 *   npx tsx scripts/release/measure-gateway-hotpath.mts
 */
import { performance } from "node:perf_hooks";
import { Effect } from "effect";
import {
  decodeExecuteInput,
  decodeSearchInput,
} from "../../packages/clawql-api/src/schema/search-execute-schema.ts";

const N = Number(process.env.CLAWQL_HOTPATH_ITERS ?? 2000);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

async function bench(label: string, fn: () => Promise<unknown>): Promise<void> {
  for (let i = 0; i < 50; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  console.log(
    JSON.stringify({
      label,
      n: N,
      p50_ms: Number(percentile(samples, 50).toFixed(4)),
      p95_ms: Number(percentile(samples, 95).toFixed(4)),
      mean_ms: Number((sum / samples.length).toFixed(4)),
    })
  );
}

await bench("decodeSearchInput", () =>
  Effect.runPromise(decodeSearchInput({ query: "list jobs" }))
);
await bench("decodeExecuteInput", () =>
  Effect.runPromise(
    decodeExecuteInput({
      operationId: "run.projects.locations.services.list",
      args: { parent: "projects/p" },
    })
  )
);

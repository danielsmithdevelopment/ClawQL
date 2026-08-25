#!/usr/bin/env node
/**
 * Dry-run Agents OpenBench scorecard via clawql-agents runAgentBenchmarkDry.
 * Usage: node integrations/agents-bench/scripts/dry-run.mjs [agent] [family]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { runAgentBenchmarkDry } from "../../../packages/clawql-agents/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const agent = process.argv[2] ?? "cline";
const family = process.argv[3] ?? "S";
const fixture = JSON.parse(
  readFileSync(join(root, "agents-bench/fixtures/family-s-smoke.json"), "utf8")
);
const dir = mkdtempSync(join(tmpdir(), "agents-bench-"));
const scorecard = await Effect.runPromise(
  runAgentBenchmarkDry({
    agentName: agent,
    family,
    tasks: fixture.tasks,
    config: {
      mcpEndpoint: "http://127.0.0.1:8080/mcp",
      wormDbPath: join(dir, "worm.db"),
      inferenceEndpoint: "http://127.0.0.1:8091/v1",
      virtualKeyId: "vk_bench_dry",
      teeEnabled: false,
    },
  })
);
console.log(JSON.stringify(scorecard, null, 2));
if (!scorecard.results.every((r) => r.delta.wormComplete)) {
  process.exit(1);
}

/**
 * Ramp ClawQL resident density under an 8G cgroup until failure.
 * Birth-inside-cgroup: invoke this script already moved into the cgroup
 * (see run-clawql-8g-ramp.sh).
 *
 * publishable: false
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Effect } from "effect";
import { makeDensityConversationRuntime } from "../../../packages/clawql-api/src/program/density/density-conversation-runtime.ts";
import { INFINITY_MATCHED_TURNS } from "../../../packages/clawql-api/src/program/density/infinity-matched-shape.ts";
import {
  forceGcEffect,
  readProcessRssEffect,
} from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const step = Number(process.env.CLAWQL_8G_STEP || 2500);
const maxAgents = Number(process.env.CLAWQL_8G_MAX || 200_000);
const bagDir = process.env.CLAWQL_8G_BAG || "/tmp/clawql-8g-resident";
const outPath =
  process.env.CLAWQL_8G_OUT ||
  "docs/benchmarks/program-density/infinity-on-pi/clawql-resident-8g-ramp.json";

const rt = makeDensityConversationRuntime(bagDir);
await Effect.runPromise(rt.clear());
await Effect.runPromise(forceGcEffect());

const points = [];
const rss0 = (await Effect.runPromise(readProcessRssEffect())).rssKiB;
points.push({ agents: 0, rssKiB: rss0 });

let launched = 0;
let failedAt = null;
let error = null;

try {
  while (launched < maxAgents) {
    const target = Math.min(launched + step, maxAgents);
    while (launched < target) {
      const id = await Effect.runPromise(rt.createAgent(launched));
      await Effect.runPromise(rt.driveAllTurns(id, INFINITY_MATCHED_TURNS));
      await Effect.runPromise(rt.retainResident(id));
      launched += 1;
    }
    await Effect.runPromise(forceGcEffect());
    const rss = (await Effect.runPromise(readProcessRssEffect())).rssKiB;
    points.push({ agents: launched, rssKiB: rss });
    console.error(`clawql8g agents=${launched} rssKiB=${rss}`);
    // Checkpoint each step so an OOM still leaves evidence on disk.
    writeEvidence({
      points,
      agentsReached: launched,
      failedAt: null,
      error: null,
      status: "running",
    });
  }
} catch (e) {
  failedAt = launched;
  error = e instanceof Error ? e.message : String(e);
  console.error(`clawql8g failed at n=${launched}: ${error}`);
}

function writeEvidence(partial) {
  const evidence = {
    kind: "clawql-resident-8g-ramp",
    publishable: false,
    measuredAt: new Date().toISOString(),
    label: "8 GB memory limit on cloud-agent-kvm-vm (not Raspberry Pi)",
    memoryMaxBytes: 8589934592,
    step,
    cgroup: process.env.CLAWQL_8G_CGROUP || null,
    honesty:
      "DensityConversationRuntime scripted append path (Infinity-matched messages). " +
      "Not the full ClawQL durable program / MCP agent stack — history-cost harness only.",
    ...partial,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

writeEvidence({
  points,
  agentsReached: launched,
  failedAt,
  error,
  status: failedAt != null ? "oom_or_abort" : "completed",
});
console.log(JSON.stringify({ outPath, agentsReached: launched, failedAt, last: points.at(-1) }));

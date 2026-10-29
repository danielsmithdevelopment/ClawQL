/**
 * Ramp ClawQL resident density under an 8G cgroup until failure.
 * Birth-inside-cgroup: invoke this script already moved into the cgroup
 * (see run-clawql-8g-ramp.sh). Requires --expose-gc.
 *
 * publishable: false
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { Effect } from "effect";
import { makeDensityConversationRuntime } from "../../../packages/clawql-api/src/program/density/density-conversation-runtime.ts";
import {
  INFINITY_MATCHED_TURNS,
  buildInfinityMatchedTurnMessagesEffect,
  serializeDensityMessagesBytesEffect,
} from "../../../packages/clawql-api/src/program/density/infinity-matched-shape.ts";
import {
  fitCapIntegrityEffect,
  slopeIntegrityEffect,
} from "../../../packages/clawql-api/src/program/density/infinity-harness-v2.ts";
import {
  forceFullGcEffect,
  readProcessRssEffect,
} from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const step = Number(process.env.CLAWQL_8G_STEP || 2500);
const maxAgents = Number(process.env.CLAWQL_8G_MAX || 200_000);
const memoryMaxBytes = Number(process.env.CLAWQL_8G_MEMORY_MAX_BYTES || 8589934592);
const bagDir = process.env.CLAWQL_8G_BAG || "/tmp/clawql-8g-resident";
const outPath =
  process.env.CLAWQL_8G_OUT ||
  "docs/benchmarks/program-density/infinity-on-pi/clawql-resident-8g-ramp.json";
const cgroup = process.env.CLAWQL_8G_CGROUP || null;

function readSwap() {
  if (!cgroup) return { swapMax: null, swapCurrent: null, swapPeak: null };
  const read = (name) => {
    try {
      return readFileSync(`${cgroup}/${name}`, "utf8").trim();
    } catch {
      return null;
    }
  };
  return {
    swapMax: read("memory.swap.max"),
    swapCurrent: read("memory.swap.current"),
    swapPeak: read("memory.swap.peak"),
  };
}

const historyMessages = [];
for (let t = 0; t < INFINITY_MATCHED_TURNS; t++) {
  historyMessages.push(
    ...(await Effect.runPromise(
      buildInfinityMatchedTurnMessagesEffect("agent-0", t, `parity-${t}`)
    ))
  );
}
const historySerializedBytes = await Effect.runPromise(
  serializeDensityMessagesBytesEffect(historyMessages)
);

const rt = makeDensityConversationRuntime(bagDir);
await Effect.runPromise(rt.clear());
await Effect.runPromise(forceFullGcEffect(3));

const points = [];
const rss0 = (await Effect.runPromise(readProcessRssEffect())).rssKiB;
points.push({ agents: 0, rssKiB: rss0 });

let launched = 0;
let failedAt = null;
let error = null;

function linearSlopeKiB(pts) {
  const xs = pts.filter((p) => p.agents > 0);
  if (xs.length < 2) return null;
  const n = xs.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (const p of xs) {
    sumX += p.agents;
    sumY += p.rssKiB;
    sumXY += p.agents * p.rssKiB;
    sumXX += p.agents * p.agents;
  }
  const den = n * sumXX - sumX * sumX;
  if (den === 0) return null;
  return Math.round(((n * sumXY - sumX * sumY) / den) * 1000) / 1000;
}

async function writeEvidence(partial) {
  const slopeKiBPerAgent = linearSlopeKiB(partial.points ?? points);
  const lastFitAgents = partial.agentsReached ?? launched;
  const historyIntegrity = await Effect.runPromise(
    slopeIntegrityEffect({
      historySerializedBytes,
      measuredKiBPerAgent: slopeKiBPerAgent,
      kind: "resident_rss_slope",
    })
  );
  const fitCap =
    slopeKiBPerAgent != null && lastFitAgents > 0
      ? await Effect.runPromise(
          fitCapIntegrityEffect({
            lastFitAgents,
            slopeKiBPerAgent,
            memoryMaxBytes,
          })
        )
      : null;
  const swap = readSwap();
  const evidence = {
    kind: "clawql-resident-8g-ramp",
    publishable: false,
    measuredAt: new Date().toISOString(),
    label: "8 GB memory limit on cloud-agent-kvm-vm (not Raspberry Pi)",
    memoryMaxBytes,
    memorySwapMax: swap.swapMax,
    memorySwapCurrent: swap.swapCurrent,
    memorySwapPeak: swap.swapPeak,
    uniqueContent: "v2",
    step,
    cgroup,
    historySerializedBytes,
    slopeKiBPerAgent,
    historyIntegrity,
    fitCapIntegrity: fitCap,
    nodeFlags: "--expose-gc --max-old-space-size=8192",
    honesty:
      "DensityConversationRuntime unique-content v2; forced full GC before each RSS sample; " +
      "cgroup memory.swap.max=0. History-cost harness — not full ClawQL durable/MCP stack. " +
      "fitCapIntegrity: lastFit × slope ≤ memory.max.",
    ...partial,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  if (fitCap && !fitCap.ok && partial.status !== "running") {
    console.error(`FIT_CAP_INTEGRITY_FAILED: ${fitCap.detail}`);
  }
  return evidence;
}

try {
  while (launched < maxAgents) {
    const target = Math.min(launched + step, maxAgents);
    while (launched < target) {
      const id = await Effect.runPromise(rt.createAgent(launched));
      await Effect.runPromise(rt.driveAllTurns(id, INFINITY_MATCHED_TURNS));
      await Effect.runPromise(rt.retainResident(id));
      launched += 1;
    }
    await Effect.runPromise(forceFullGcEffect(3));
    const rss = (await Effect.runPromise(readProcessRssEffect())).rssKiB;
    points.push({ agents: launched, rssKiB: rss });
    console.error(`clawql8g agents=${launched} rssKiB=${rss}`);
    await writeEvidence({
      points: [...points],
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

const finalEv = await writeEvidence({
  points: [...points],
  agentsReached: launched,
  failedAt,
  error,
  status: failedAt != null ? "oom_or_abort" : "completed",
});
console.log(
  JSON.stringify({
    outPath,
    agentsReached: launched,
    failedAt,
    last: points.at(-1),
    slopeKiBPerAgent: finalEv.slopeKiBPerAgent,
    fitCapOk: finalEv.fitCapIntegrity?.ok ?? null,
    swapPeak: finalEv.memorySwapPeak,
  })
);
if (finalEv.fitCapIntegrity && !finalEv.fitCapIntegrity.ok) {
  process.exitCode = 2;
}

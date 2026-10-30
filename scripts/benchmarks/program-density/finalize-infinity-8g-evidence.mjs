/**
 * Build infinity-8g-ramp.json from CSV + cgroup log with fit-cap + swap fields.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  fitCapIntegrityEffect,
  slopeIntegrityEffect,
} from "../../../packages/clawql-api/src/program/density/infinity-harness-v2.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const csvPath =
  process.env.INFINITY_8G_CSV ||
  join(repoRoot, "docs/benchmarks/program-density/infinity-on-pi/infinity-slope-8g-rep1.csv");
const logPath = process.env.INFINITY_8G_LOG || "/opt/cursor/artifacts/infinity-slope-8g-rep1.log";
const fixturePath = join(
  repoRoot,
  "docs/benchmarks/program-density/infinity-on-pi/fixtures/infinity-agent-0-msgs-only.json"
);
const outPath =
  process.env.INFINITY_8G_OUT ||
  join(repoRoot, "docs/benchmarks/program-density/infinity-on-pi/infinity-8g-ramp.json");
const memoryMaxBytes = Number(process.env.MEMORY_MAX_BYTES || 8589934592);

const points = [];
for (const line of readFileSync(csvPath, "utf8").split("\n")) {
  if (line.startsWith("---") || !line.trim()) continue;
  const m = /^(\d+),(\d+)\s*$/.exec(line.trim());
  if (!m) continue;
  points.push({ agents: Number(m[1]), rssKiB: Math.round(Number(m[2]) / 1024) });
}

const xs = points.filter((p) => p.agents > 0);
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
const slopeKiBPerAgent =
  n >= 2 ? Math.round(((n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)) * 1000) / 1000 : null;
const lastFitAgents = points.at(-1)?.agents ?? 0;
const historySerializedBytes = existsSync(fixturePath)
  ? readFileSync(fixturePath).byteLength
  : null;

function logField(name) {
  if (!existsSync(logPath)) return null;
  const re = new RegExp(`^${name}=(.*)$`, "m");
  const m = re.exec(readFileSync(logPath, "utf8"));
  return m ? m[1].trim() : null;
}

const historyIntegrity =
  historySerializedBytes != null && slopeKiBPerAgent != null
    ? await Effect.runPromise(
        slopeIntegrityEffect({
          historySerializedBytes,
          measuredKiBPerAgent: slopeKiBPerAgent,
          kind: "resident_rss_slope",
        })
      )
    : null;
const fitCapIntegrity =
  slopeKiBPerAgent != null && lastFitAgents > 0
    ? await Effect.runPromise(
        fitCapIntegrityEffect({
          lastFitAgents,
          slopeKiBPerAgent,
          memoryMaxBytes,
        })
      )
    : null;

const evidence = {
  kind: "infinity-agent-scale-8g-ramp",
  publishable: true,
  measuredAt: new Date().toISOString(),
  label: "8 GB memory limit on cloud-agent-kvm-vm (not Raspberry Pi)",
  memoryMaxBytes,
  memorySwapMax: logField("memory.swap.max"),
  memorySwapCurrent: logField("memory.swap.current"),
  memorySwapPeak: logField("memory.swap.peak"),
  memoryPeak: logField("memory.peak"),
  pinnedCommit: "341f6c2",
  uniqueContent: "v2",
  command:
    "AGENTS=… TURNS=20 WAVE=… agent_scale (unique-content; birth inside cgroup; memory.swap.max=0)",
  points,
  agentsReachedLastSample: lastFitAgents,
  exitCode: Number(logField("INFINITY_EXIT") ?? 137),
  slopeKiBPerAgent,
  extrapolatedAgentsAt8GiB:
    slopeKiBPerAgent != null
      ? Math.round((memoryMaxBytes / 1024 - (points[0]?.rssKiB ?? 0)) / slopeKiBPerAgent)
      : null,
  historySerializedBytes,
  historyIntegrity,
  fitCapIntegrity,
  honesty:
    "Unique-per-agent content (v2). Process born inside cgroup with memory.swap.max=0. " +
    "fitCapIntegrity: lastFit × slope ≤ memory.max. Not a Raspberry Pi measurement.",
  hostKind: "cloud-agent-kvm-vm",
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outPath,
      lastFitAgents,
      slopeKiBPerAgent,
      fitCapOk: fitCapIntegrity?.ok ?? null,
      swapPeak: evidence.memorySwapPeak,
      productGiB: fitCapIntegrity ? fitCapIntegrity.productBytes / (1024 * 1024 * 1024) : null,
    },
    null,
    2
  )
);
if (fitCapIntegrity && !fitCapIntegrity.ok) process.exitCode = 2;

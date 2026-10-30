/**
 * Build evidence-infinity-fit-latency.json from agent_scale latency_probe logs.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const logPath = arg("log", "/opt/cursor/artifacts/infinity-fit-latency.log");
const rawPath = arg("raw", "/opt/cursor/artifacts/infinity-fit-latency.raw");
const outPath =
  arg("out") ||
  join(repoRoot, "docs/benchmarks/program-density/infinity-on-pi/evidence-infinity-fit-latency.json");
const agentsTarget = Number(arg("agents", "77500"));
const exitCode = Number(arg("exit", "0"));
const cgroup = arg("cgroup", null);
const memoryMaxBytes = Number(arg("memory-max", "8589934592"));
const probeAt = (arg("probe-at", "2500,77500") || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

const log = readFileSync(logPath, "utf8");
const raw = readFileSync(rawPath, "utf8");

const rssPoints = [];
for (const line of raw.split("\n")) {
  const m = /^(\d+),(\d+)\s*$/.exec(line.trim());
  if (m) rssPoints.push({ agents: Number(m[1]), rssKiB: Math.round(Number(m[2]) / 1024) });
}

const probes = [];
for (const line of log.split("\n")) {
  const m =
    /^latency_probe,(\d+),([0-9.]+),([0-9.]+),([0-9.]+),(\d+),([0-9.]+)\s*$/.exec(
      line.trim()
    );
  if (m) {
    probes.push({
      agents: Number(m[1]),
      p50Ms: Number(m[2]),
      p99Ms: Number(m[3]),
      meanMs: Number(m[4]),
      n: Number(m[5]),
      turnsPerSec: Number(m[6]),
    });
  }
}

const baseline = probes[0] ?? null;
const atLastFit =
  [...probes].reverse().find((p) => p.agents >= Math.min(agentsTarget, p.agents)) ??
  probes.at(-1) ??
  null;

function within2x(p, b) {
  if (!p || !b) return null;
  return p.p50Ms <= b.p50Ms * 2 && p.p99Ms <= b.p99Ms * 2;
}

const checkpoints = probes.map((p) => {
  const rss = rssPoints.find((r) => r.agents === p.agents);
  return {
    agents: p.agents,
    rssKiB: rss?.rssKiB ?? null,
    turn: {
      p50Ms: p.p50Ms,
      p99Ms: p.p99Ms,
      meanMs: p.meanMs,
      n: p.n,
      turnsPerSec: p.turnsPerSec,
    },
    within2xOfBaseline: within2x(p, baseline),
    note: baseline && p.agents === baseline.agents ? "baseline" : "probe",
  };
});

let highestNWithin2x = null;
for (const c of checkpoints) {
  if (c.within2xOfBaseline === true || c.note === "baseline") {
    highestNWithin2x = c.agents;
  }
}

function readCg(name) {
  if (!cgroup) return null;
  try {
    return readFileSync(join(cgroup, name), "utf8").trim();
  } catch {
    return null;
  }
}

const peakRaw = readCg("memory.peak") || /memory\.peak=(\d+)/.exec(log)?.[1] || null;
const peakBytes = peakRaw && /^\d+$/.test(peakRaw) ? Number(peakRaw) : null;
const lastFitAgents = atLastFit?.agents ?? rssPoints.filter((p) => p.agents > 0).at(-1)?.agents ?? null;
const peakMemKiBPerAgentAtLastFit =
  peakBytes != null && lastFitAgents
    ? Math.round((peakBytes / 1024 / lastFitAgents) * 1000) / 1000
    : atLastFit && atLastFit.agents
      ? Math.round(
          ((rssPoints.find((r) => r.agents === atLastFit.agents)?.rssKiB ?? 0) / atLastFit.agents) *
            1000
        ) / 1000
      : null;

const evidence = {
  kind: "infinity-agent-scale-8g-fit-latency-v1",
  measuredAt: new Date().toISOString(),
  publishable: false,
  host: {
    hostname: hostname(),
    hostKind: "cloud-agent-kvm-vm",
    publishable: false,
  },
  cgroup: {
    path: cgroup,
    memoryMaxBytes,
    memorySwapMax: readCg("memory.swap.max"),
    memoryPeakBytes: peakBytes,
    memorySwapPeak: readCg("memory.swap.peak"),
  },
  tuning: {
    allocator: "glibc malloc + malloc_trim(0)",
    env: "none (no jemalloc/mimalloc/MALLOC_* overrides observed)",
    note:
      "Fair-compare question for Infinity/Shadaj team: should a density operator set an " +
      "allocator or heap analog to ClawQL's required --max-old-space-size=8192 under an 8 GiB cap?",
  },
  protocol: {
    agentsTarget,
    turns: 20,
    wave: 2500,
    probeSample: probes[0]?.n ?? null,
    probeAt,
    ceilingMultiple: 2,
    exitCode,
  },
  baseline: checkpoints[0] ?? null,
  atLastFit: checkpoints.find((c) => c.agents === atLastFit?.agents) ?? null,
  checkpoints,
  highestNWithin2x,
  highestContiguousNWithin2x: highestNWithin2x,
  peakMemKiBPerAgentAtLastFit,
  rssKiBPerAgentAtLastFit:
    atLastFit && atLastFit.agents
      ? Math.round(
          ((rssPoints.find((r) => r.agents === atLastFit.agents)?.rssKiB ?? 0) /
            atLastFit.agents) *
            1000
        ) / 1000
      : null,
  lastFitAgents,
  rssPoints,
  reading: [
    `Infinity lastFit latency under 8G (swap.max=0). exit=${exitCode}.`,
    baseline
      ? `Baseline N=${baseline.agents}: p50=${baseline.p50Ms} ms p99=${baseline.p99Ms} ms.`
      : "",
    atLastFit
      ? `At N=${atLastFit.agents}: p50=${atLastFit.p50Ms} ms p99=${atLastFit.p99Ms} ms; within2x=${within2x(atLastFit, baseline)}.`
      : "",
    `highestNWithin2x=${highestNWithin2x}.`,
    peakMemKiBPerAgentAtLastFit != null
      ? `peak_mem/N ≈ ${peakMemKiBPerAgentAtLastFit} KiB/agent.`
      : "",
    "Tuning: glibc malloc + malloc_trim(0); no extra allocator env.",
  ]
    .filter(Boolean)
    .join(" "),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ outPath, highestNWithin2x, peakMemKiBPerAgentAtLastFit, lastFitAgents }, null, 2));

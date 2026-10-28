import { readFileSync, writeFileSync } from "node:fs";

const evidencePath = "docs/benchmarks/program-density/evidence-fair.json";
const gc = JSON.parse(
  readFileSync("/opt/cursor/artifacts/deadline-throughput-group-commit.json", "utf8")
);
const compare = JSON.parse(
  readFileSync("/opt/cursor/artifacts/deadline-flush-policy-compare.json", "utf8")
);
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));

const report = gc.report;
const flush = report.scheduler.flushPolicy;
const publishedSustainable = compare.group_commit.sustainablePerSecMin;

const deadlineAccuracy = {
  ...report,
  sustainablePerSec: publishedSustainable,
  sustainablePerSecNote: {
    policy: "group_commit",
    batchMax: 64,
    flushIntervalMs: 10,
    conservativeFloor: compare.group_commit.sustainablePerSecMin,
    threeRepMedian: compare.group_commit.sustainablePerSecMedian,
    threeRepMax: compare.group_commit.sustainablePerSecMax,
    fsyncEachSustainablePerSec: compare.fsync_each.sustainablePerSec,
    osBufferWasNotCrashDurable:
      "~1.2e6 prior v7 figure was writeSync/page-cache only — superseded",
    steadyP99Note:
      "Steady excess p99 ~293ms at ~667/s is NOT the 10ms flush interval — flush stamps after fsync; residual is timer/event-loop under the 2.5e6 resident heap pad.",
  },
  crashTest: gc.crashTest,
  flushPolicyCompare: {
    group_commit: compare.group_commit,
    fsync_each: {
      sustainablePerSec: compare.fsync_each.sustainablePerSec,
      ramp: compare.fsync_each.ramp,
    },
  },
};

const boardDeadline = {
  slaMs: report.slaMs,
  slaTargetPct: report.slaTargetPct,
  firedDefinition: report.scheduler.firedDefinition,
  concurrency: report.scheduler.concurrency,
  flushPolicy: {
    mode: flush.mode,
    batchMax: flush.batchMax,
    flushIntervalMs: flush.flushIntervalMs,
    durabilityWindowTriggers: flush.durabilityWindowTriggers,
    durabilityWindowMs: flush.durabilityWindowMs,
    crashSafe: flush.crashSafe,
    syncPrimitive: flush.syncPrimitive,
  },
  crashTestOk: gc.crashTest?.ok ?? false,
  steadyArrivalRatePerSec: report.steady.arrivalRatePerSec,
  steadyPctMet: report.steady.pctWithinSla,
  steadyP99ExcessMs: report.steady.excessOverTickP99Ms,
  burstPctMet: report.burst.pctWithinSla,
  burstP99ExcessMs: report.burst.excessOverTickP99Ms,
  burstDrainPerSec: report.burst.arrivalRatePerSec,
  sustainablePerSec: publishedSustainable,
};

evidence.measuredAt = new Date().toISOString();
evidence.contract.agent.wakeDeadline =
  "Randomly spread wakeDeadlineAt; fire within shared SLA (default 1s); identical fired definition (durable_trigger_record); explicit flush policy (default group_commit batchMax=64 intervalMs=10); lateness stamped after fsync; arrival-rate ramp; SIGKILL crash test";
evidence.contract.columns = evidence.contract.columns.map((c) =>
  c.startsWith("deadlineAccuracy")
    ? "deadlineAccuracy (slaMs, firedDefinition, flushPolicy, crashTest, arrivalRate, steady/burst, sustainablePerSec)"
    : c
);
evidence.contract.memoryFraming =
  "Retained at limit = wake-deadline schedule. Deadline accuracy requires identical fired definition + flush policy (or disclose each). Fired stamps after flush. os_buffer page-cache writes are not durable and must not be published as such. Cold wake: median+range only until shared-host.";

const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
clawql.boardColumns.deadlineAccuracy = boardDeadline;
clawql.honesty = [
  "ClawQL TypeScript fair-v2 (methodology v8). Schedule retained at 2.5e6 (rss limit).",
  "Fired=durable_trigger_record; flush=group_commit(batchMax=64, intervalMs=10, fsync); crashTest=pass; lateness stamped after fsync.",
  `Steady ~667/s → ${report.steady.pctWithinSla}% met / excess p99 ${report.steady.excessOverTickP99Ms} ms (excess ≫ 10ms flush interval — timer/heap under resident pad, not a flush knob).`,
  `Burst drain ~${report.burst.arrivalRatePerSec}/s → ${report.burst.pctWithinSla}% met.`,
  `sustainablePerSec=${publishedSustainable} (conservative 3-rep floor under group_commit; median ${compare.group_commit.sustainablePerSecMedian}; fsync_each ≈ ${compare.fsync_each.sustainablePerSec}).`,
  "Prior ~1.2e6 was os_buffer/page-cache — not crash-durable; superseded.",
  "Provisional vs Ontologiql until shared flush policy + crash test. No win copy.",
].join(" ");

const ont = evidence.rows.find((r) => r.systemId === "ontologiql-rust");
ont.honesty =
  "Ontologiql Rust fair row is publishable on the pre-deadline contract. **deadlineAccuracy not yet measured** — invite to fair-v2: identical fired definition (durable_trigger_record); identical flush policy (or disclose); arrival-rate ramp; SIGKILL crash test (counted fires on disk, no duplicates). Do not read cold-wake gaps until shared-host.";

evidence.clawqlRun.deadlineAccuracy = deadlineAccuracy;
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      updated: evidencePath,
      flush: boardDeadline.flushPolicy,
      crashTestOk: boardDeadline.crashTestOk,
      sustainablePerSec: publishedSustainable,
      steadyExcessP99: report.steady.excessOverTickP99Ms,
    },
    null,
    2
  )
);

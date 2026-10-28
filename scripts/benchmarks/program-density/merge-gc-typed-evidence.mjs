import { readFileSync, writeFileSync } from "node:fs";

const evidencePath = "docs/benchmarks/program-density/evidence-fair.json";
const typedThroughput = JSON.parse(
  readFileSync("/opt/cursor/artifacts/deadline-throughput-typed-group-commit.json", "utf8")
);
const typedSustainable = JSON.parse(
  readFileSync("/opt/cursor/artifacts/deadline-typed-sustainable-reps.json", "utf8")
);
const gcAb = JSON.parse(readFileSync("/opt/cursor/artifacts/deadline-gc-pad-and-pump.json", "utf8"));
const compare = JSON.parse(
  readFileSync("/opt/cursor/artifacts/deadline-flush-policy-compare.json", "utf8")
);
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));

const report = typedThroughput.report;
const flush = report.scheduler.flushPolicy;
const publishedSustainable = typedSustainable.sustainablePerSecMin;

const scheduleAb = {
  residentHeapSize: 2_500_000,
  object_entries: {
    steadyExcessP99Ms: gcAb.object_entries.steady.excessP99,
    majorPauseMaxMs: gcAb.object_entries.majorPauseMaxMs ?? gcAb.object_entries.maxPauseMs,
    lateOverlapFraction: gcAb.object_entries.steady.gcTrace.lateOverlapFraction,
    lateFiresOverlappingMajorGc: gcAb.object_entries.steady.gcTrace.lateFiresOverlappingMajorGc,
    note: "Object-per-entry heap under 2.5e6 pad: major GC ~121 ms; 100% of late fires (≥50 ms) overlap that pause.",
  },
  typed_arrays: {
    steadyExcessP99Ms: report.steady.excessOverTickP99Ms,
    majorPauseMaxMs: report.steady.gcTrace?.majorPauseMaxMs ?? 0,
    lateOverlapFraction: report.steady.gcTrace?.lateOverlapFraction ?? 0,
    note: "Board default. Float64 deadlines + Int32 heap indices; sparse agent Map. Steady excess p99 collapses ~10×.",
  },
  reading: gcAb.reading.note,
};

const deadlineAccuracy = {
  ...report,
  scheduleShape: "typed_arrays",
  sustainablePerSec: publishedSustainable,
  sustainablePerSecNote: {
    policy: "group_commit",
    batchMax: 64,
    flushIntervalMs: 10,
    scheduleShape: "typed_arrays",
    conservativeFloor: typedSustainable.sustainablePerSecMin,
    threeRepMedian: typedSustainable.sustainablePerSecMedian,
    threeRepMax: typedSustainable.sustainablePerSecMax,
    threeRepValues: typedSustainable.reps,
    crashTestOk: typedSustainable.crashTestOk,
    fsyncEachSustainablePerSec: compare.fsync_each.sustainablePerSec,
    osBufferWasNotCrashDurable:
      "~1.2e6 prior v7 figure was writeSync/page-cache only — superseded",
    objectHeapSteadyP99WasGc:
      "v8 object_entries steady excess p99 ~293–314 ms lined up with major GC (~121 ms); typed_arrays is the published best-effort TS column",
  },
  crashTest: {
    ok: typedSustainable.crashTestOk,
    note: "SIGKILL mid-drain under group_commit + typed_arrays — counted fires on disk, no duplicates",
  },
  flushPolicyCompare: {
    group_commit: {
      ...compare.group_commit,
      scheduleShapeNote: "v8 compare used object_entries; v9 sustainable floor remeasured under typed_arrays = 256k×3",
    },
    fsync_each: {
      sustainablePerSec: compare.fsync_each.sustainablePerSec,
      ramp: compare.fsync_each.ramp,
    },
  },
  scheduleShapeAb: scheduleAb,
};

const boardDeadline = {
  slaMs: report.slaMs,
  slaTargetPct: report.slaTargetPct,
  firedDefinition: report.scheduler.firedDefinition,
  concurrency: report.scheduler.concurrency,
  scheduleShape: "typed_arrays",
  flushPolicy: {
    mode: flush.mode,
    batchMax: flush.batchMax,
    flushIntervalMs: flush.flushIntervalMs,
    durabilityWindowTriggers: flush.durabilityWindowTriggers,
    durabilityWindowMs: flush.durabilityWindowMs,
    crashSafe: flush.crashSafe,
    syncPrimitive: flush.syncPrimitive,
  },
  crashTestOk: typedSustainable.crashTestOk,
  steadyArrivalRatePerSec: report.steady.arrivalRatePerSec,
  steadyPctMet: report.steady.pctWithinSla,
  steadyP99ExcessMs: report.steady.excessOverTickP99Ms,
  burstPctMet: report.burst.pctWithinSla,
  burstP99ExcessMs: report.burst.excessOverTickP99Ms,
  burstDrainPerSec: report.burst.arrivalRatePerSec,
  sustainablePerSec: publishedSustainable,
  objectEntriesSteadyP99ExcessMs: gcAb.object_entries.steady.excessP99,
  objectEntriesMajorGcMaxMs: gcAb.object_entries.maxPauseMs,
};

evidence.measuredAt = new Date().toISOString();
evidence.contract.agent.wakeDeadline =
  "Randomly spread wakeDeadlineAt; fire within shared SLA (default 1s); identical fired definition (durable_trigger_record); explicit flush policy (default group_commit batchMax=64 intervalMs=10); lateness stamped after fsync; typed-array schedule (board default) with object-heap A/B for GC honesty; arrival-rate ramp; SIGKILL crash test";
evidence.contract.columns = evidence.contract.columns.map((c) =>
  c.startsWith("deadlineAccuracy")
    ? "deadlineAccuracy (slaMs, firedDefinition, flushPolicy, scheduleShape, crashTest, arrivalRate, steady/burst, sustainablePerSec, gcAb)"
    : c
);
evidence.contract.memoryFraming =
  "Retained at limit = wake-deadline schedule. Deadline accuracy requires identical fired definition + flush policy (or disclose each). Fired stamps after flush. os_buffer page-cache writes are not durable. Object-per-entry JS heaps at multi-million N incur major GC pauses — publish typed_arrays (best-effort TS) and disclose object_entries A/B. Cold wake: median+range only until shared-host.";

const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
clawql.boardColumns.deadlineAccuracy = boardDeadline;
clawql.honesty = [
  "ClawQL TypeScript fair-v2 (methodology v9). Schedule retained at 2.5e6 (rss limit) as typed_arrays (Float64 + Int32; sparse agent Map).",
  "Fired=durable_trigger_record; flush=group_commit(batchMax=64, intervalMs=10, fsync); crashTest=pass; lateness stamped after fsync.",
  `Steady ~667/s → ${report.steady.pctWithinSla}% met / excess p99 ${report.steady.excessOverTickP99Ms} ms under typed_arrays.`,
  `Object-heap A/B: excess p99 ${gcAb.object_entries.steady.excessP99} ms with major GC ~${Math.round(gcAb.object_entries.maxPauseMs)} ms and 100% late∩major-GC overlap — fair TS runtime cost when not using typed arrays.`,
  `Burst drain ~${report.burst.arrivalRatePerSec}/s → ${report.burst.pctWithinSla}% met / excess p99 ${report.burst.excessOverTickP99Ms} ms.`,
  `sustainablePerSec=${publishedSustainable} (typed_arrays + group_commit; 3-rep floor=median=max ${typedSustainable.reps.join("/")}; fsync_each ≈ ${compare.fsync_each.sustainablePerSec}).`,
  "Prior ~1.2e6 was os_buffer/page-cache — not crash-durable; superseded. v8 ~293 ms steady tail was GC under object_entries — superseded by typed default.",
  "Provisional vs Ontologiql until shared flush policy + crash test + schedule-shape disclosure. No win copy.",
].join(" ");

const ont = evidence.rows.find((r) => r.systemId === "ontologiql-rust");
ont.honesty =
  "Ontologiql Rust fair row is publishable on the pre-deadline contract. **deadlineAccuracy not yet measured** — invite to fair-v2: identical fired definition (durable_trigger_record); identical flush policy (or disclose); schedule-shape disclosure (Rust has no JS GC equivalent); arrival-rate ramp; SIGKILL crash test (counted fires on disk, no duplicates). Do not read cold-wake gaps until shared-host.";

evidence.clawqlRun.residentAccounting = {
  ...evidence.clawqlRun.residentAccounting,
  retainedInProcess:
    "Wake-deadline typed-array min-heap (Float64 deadline + Int32 index) for every counted agent — approval expiry / reminder schedule. Sparse agentId Map for live agents only. Bag path derived from agentId (FS is the id index).",
  scheduleShape: "deadline_typed_arrays",
  estimatedScheduleBytesPerAgent: 20,
};
evidence.clawqlRun.deadlineAccuracy = deadlineAccuracy;
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      updated: evidencePath,
      methodology: "v9",
      scheduleShape: "typed_arrays",
      flush: boardDeadline.flushPolicy,
      crashTestOk: boardDeadline.crashTestOk,
      sustainablePerSec: publishedSustainable,
      typedSteadyExcessP99: report.steady.excessOverTickP99Ms,
      objectSteadyExcessP99: gcAb.object_entries.steady.excessP99,
      objectMajorGcMs: Math.round(gcAb.object_entries.maxPauseMs),
    },
    null,
    2
  )
);

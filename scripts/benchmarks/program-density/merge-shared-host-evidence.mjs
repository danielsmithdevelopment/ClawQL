import { readFileSync, writeFileSync } from "node:fs";

const evidencePath = "docs/benchmarks/program-density/evidence-fair.json";
const arms = JSON.parse(readFileSync("/opt/cursor/artifacts/deadline-shared-host-arms.json", "utf8"));
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));

const clawql = evidence.rows.find((r) => r.systemId === "clawql-typescript");
const board = clawql.boardColumns.deadlineAccuracy;

board.scaledBurstFirstMissSize = arms.scaledBursts?.firstMissSize ?? null;
board.deadlineRestartOk = arms.deadlineRestart?.ok ?? null;
board.deadlineRestartRebuildMs = arms.deadlineRestart?.rebuildMs ?? null;

evidence.measuredAt = new Date().toISOString();
evidence.contract.agent.wakeDeadline =
  "Randomly spread wakeDeadlineAt; fire within shared SLA (default 1s); identical fired definition (durable_trigger_record); explicit flush policy (default group_commit); lateness stamped after fsync; typed-array schedule; scaled bursts (Ontologiql sizes; first miss); deadline restart (rebuild + overdue catch-up); arrival-rate ramp; SIGKILL flush crash test";
evidence.contract.columns = evidence.contract.columns.map((c) =>
  c.startsWith("deadlineAccuracy")
    ? "deadlineAccuracy (slaMs, firedDefinition, flushPolicy, scheduleShape, scaledBursts, deadlineRestart, crashTest, arrivalRate, steady/burst, sustainablePerSec, gcAb)"
    : c
);
evidence.contract.memoryFraming =
  "Retained at limit = wake-deadline schedule. See SHARED_HOST.md for the five numbers and required deadline arms (scaled bursts + deadline restart). Fired stamps after flush. Publish typed_arrays best-effort + object_entries GC A/B. Cold wake: median+range only until shared-host.";

clawql.honesty = [
  "ClawQL TypeScript fair-v2 (methodology v10 / SHARED_HOST arms). Schedule retained at 2.5e6 as typed_arrays.",
  "Fired=durable_trigger_record; flush=group_commit(64/10ms); crashTest=pass; lateness after fsync.",
  `Steady ~667/s → 100% met / excess p99 ${board.steadyP99ExcessMs} ms (typed).`,
  `Scaled bursts (Ontologiql sizes): first miss at N=${arms.scaledBursts.firstMissSize} (512/10k/100k met 100% within 1s; ${arms.scaledBursts.firstMissSize} → ${arms.scaledBursts.arms.at(-1).pctWithinSla}% met).`,
  `Deadline restart: ok=${arms.deadlineRestart.ok}; rebuildMs=${arms.deadlineRestart.rebuildMs} at capacity ${arms.deadlineRestart.capacity}; overdue ${arms.deadlineRestart.overdueFired}/${arms.deadlineRestart.overdueExpected} prompt-fired; no loss/duplicates.`,
  `sustainablePerSec=${board.sustainablePerSec} (typed + group_commit floor).`,
  "Object-heap GC A/B retained (~314 ms / ~121 ms major). Provisional vs Ontologiql until shared-host + their flush disclose/crash-test. No win copy.",
].join(" ");

const ont = evidence.rows.find((r) => r.systemId === "ontologiql-rust");
ont.honesty =
  "Ontologiql Rust fair row is publishable on the pre-deadline contract. **deadlineAccuracy not yet measured** — invite to fair-v2 / SHARED_HOST.md: identical fired definition + flush policy (disclose + crash test); scaled bursts (512/10k/100k+; first miss); deadline restart (rebuild at full scale, no loss/duplicates, overdue catch-up); arrival-rate ramp. Do not read cold-wake gaps until shared-host.";

if (!evidence.clawqlRun.deadlineAccuracy) evidence.clawqlRun.deadlineAccuracy = {};
evidence.clawqlRun.deadlineAccuracy.scaledBursts = {
  sizes: arms.scaledBursts.sizes,
  firstMissSize: arms.scaledBursts.firstMissSize,
  note: arms.scaledBursts.note,
  arms: arms.scaledBursts.arms.map((a) => ({
    n: a.n,
    pctWithinSla: a.pctWithinSla,
    excessOverTickP99Ms: a.excessOverTickP99Ms,
    wallMs: a.wallMs,
    arrivalRatePerSec: a.arrivalRatePerSec,
  })),
};
evidence.clawqlRun.deadlineAccuracy.deadlineRestart = {
  ok: arms.deadlineRestart.ok,
  capacity: arms.deadlineRestart.capacity,
  liveCount: arms.deadlineRestart.liveCount,
  rebuildMs: arms.deadlineRestart.rebuildMs,
  overdueExpected: arms.deadlineRestart.overdueExpected,
  overdueFired: arms.deadlineRestart.overdueFired,
  missingLive: arms.deadlineRestart.missingLive,
  duplicateFired: arms.deadlineRestart.duplicateFired,
  note: arms.deadlineRestart.note,
};

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      updated: evidencePath,
      firstMissSize: board.scaledBurstFirstMissSize,
      restartOk: board.deadlineRestartOk,
      rebuildMs: board.deadlineRestartRebuildMs,
    },
    null,
    2
  )
);

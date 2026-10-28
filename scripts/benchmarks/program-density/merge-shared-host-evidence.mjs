/**
 * Merge SHARED_HOST five-arm artifact into evidence-fair.json.
 *
 * Does not overwrite Ontologiql #144 peerLab / honesty.
 * Does not promote single-run ramp numbers over a 3-rep floor.
 *
 *   node scripts/benchmarks/program-density/merge-shared-host-evidence.mjs \
 *     [docs/benchmarks/program-density/shared-host-five-arms.json]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const evidencePath = join(repoRoot, "docs/benchmarks/program-density/evidence-fair.json");
const defaultArms = join(repoRoot, "docs/benchmarks/program-density/shared-host-five-arms.json");
const armsPath = process.argv[2] || defaultArms;

if (!existsSync(armsPath)) {
  console.error(`missing five-arm artifact: ${armsPath}`);
  process.exit(1);
}

const arms = JSON.parse(readFileSync(armsPath, "utf8"));
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));

const clawqlRow = evidence.rows.find((r) => r.systemId === "clawql-typescript");
const clawqlArms = arms.clawql?.arms;
if (!clawqlRow || !clawqlArms) {
  console.error("expected clawql row in evidence and clawql.arms in five-arm artifact");
  process.exit(1);
}

const headline = arms.clawql.headline ?? null;
const reps = headline?.reps ?? clawqlArms.ramp?.reps?.length ?? 1;
const isFloor = reps >= 3 && headline?.rule === "three_rep_floor";

evidence.sharedHostFiveArms = {
  artifact: "docs/benchmarks/program-density/shared-host-five-arms.json",
  kind: arms.kind,
  measuredAt: arms.measuredAt,
  protocol: arms.protocol ?? {
    headlineRule: "three_rep_floor",
    requiredReps: 3,
    alternation: "clawql_then_ontologiql_each_rep",
    fsyncCeilingFirst: true,
  },
  fsyncCeiling: arms.fsyncCeiling ?? null,
  sharedHostComplete: Boolean(arms.reading?.sharedHostComplete),
  winCopy: Boolean(arms.reading?.winCopy),
  peerPresent: arms.peer != null,
  peer: arms.peer,
  clawql: {
    hostLabel: arms.clawql.hostLabel,
    agentsAtLimit: arms.clawql.agentsAtLimit,
    scheduleShape: arms.clawql.scheduleShape,
    flushPolicy: arms.clawql.flushPolicy,
    headline,
    firstBurstMiss: clawqlArms.scaledBursts?.firstMissSize ?? null,
    sustainablePerSec: clawqlArms.ramp?.sustainablePerSec ?? null,
    firstRateMissingSlaPerSec: clawqlArms.ramp?.firstRateMissingSlaPerSec ?? null,
    rampWentPastFailure: clawqlArms.ramp?.rampWentPastFailure ?? null,
    crashOk: clawqlArms.crashTest?.ok ?? null,
    restartOk: clawqlArms.deadlineRestart?.ok ?? null,
    rebuildMs: clawqlArms.deadlineRestart?.rebuildMs ?? null,
    scheduleFormat: arms.clawql.scheduleFormat ?? null,
    note: isFloor
      ? "3-rep floor headlines from interleaved shared-host campaign."
      : "Scaffold / single-run snapshot only. Board deadlineAccuracy quotes the conservative 256k 3-rep floor until the shared-host campaign (SHARED_HOST.md protocol).",
  },
  reading: arms.reading,
};

evidence.contract.memoryFraming =
  "Retained at limit = wake-deadline schedule. SHARED_HOST.md campaign protocol: (1) 3-rep floor headlines for both systems; (2) measure fsync ceiling once before either run; (3) alternate ClawQL/Ontologiql across reps on one idle host/disk; then CLAWQL_DENSITY_PEER_JSON merge. group_commit sustained rate is disk-fsync bound — read as fraction of ceiling. RebuildMs requires schedule-format disclosure. No win copy until sharedHostComplete.";

clawqlRow.honesty = [
  "ClawQL TypeScript fair-v2 (methodology v10). Schedule 2.5e6 typed_arrays; format disclosed (header+live NDJSON+padCount; bulk pad + bottom-up heapify).",
  "Fired=durable_trigger_record; flush=group_commit(64/10ms); crashTest=pass; lateness after fsync.",
  "Steady ~667/s → 100% / excess p99 22 ms. Scaled bursts first miss N=250000 (N ≤ agentsAtLimit).",
  "Ramp board headline: sustainablePerSec=256000; firstRateMissingSlaPerSec=384000 (3-rep floor). Single-run harness may print higher — do not cross-compare floors vs singles.",
  "Deadline restart pass; rebuildMs~40–55 at 2.5e6. Object-heap GC A/B retained.",
  "Under group_commit, sustained rate ≈ disk fsync bound — measure fsync ceiling on shared host; fraction-of-ceiling reading.",
  "Methodology aligned with Ontologiql #144.",
  "SHARED_HOST protocol settled: 3-rep floor + fsync ceiling first + alternating systems. Harness scaffold ready; sharedHostComplete=false until interleaved campaign + peer merge. No win copy.",
].join(" ");

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      updated: evidencePath,
      from: armsPath,
      sharedHostComplete: evidence.sharedHostFiveArms.sharedHostComplete,
      peerPresent: evidence.sharedHostFiveArms.peerPresent,
      isThreeRepFloor: isFloor,
      firstBurstMiss: evidence.sharedHostFiveArms.clawql.firstBurstMiss,
      rebuildMs: evidence.sharedHostFiveArms.clawql.rebuildMs,
    },
    null,
    2
  )
);

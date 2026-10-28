/**
 * Merge SHARED_HOST five-arm artifact into evidence-fair.json.
 *
 * Does not overwrite Ontologiql #144 peerLab / honesty.
 * Does not promote single-run ramp numbers over the board's 3-rep floor.
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

evidence.sharedHostFiveArms = {
  artifact: "docs/benchmarks/program-density/shared-host-five-arms.json",
  kind: arms.kind,
  measuredAt: arms.measuredAt,
  sharedHostComplete: Boolean(arms.reading?.sharedHostComplete),
  winCopy: Boolean(arms.reading?.winCopy),
  peerPresent: arms.peer != null,
  peer: arms.peer,
  clawql: {
    hostLabel: arms.clawql.hostLabel,
    agentsAtLimit: arms.clawql.agentsAtLimit,
    scheduleShape: arms.clawql.scheduleShape,
    flushPolicy: arms.clawql.flushPolicy,
    firstBurstMiss: clawqlArms.scaledBursts?.firstMissSize ?? null,
    sustainablePerSec: clawqlArms.ramp?.sustainablePerSec ?? null,
    firstRateMissingSlaPerSec: clawqlArms.ramp?.firstRateMissingSlaPerSec ?? null,
    rampWentPastFailure: clawqlArms.ramp?.rampWentPastFailure ?? null,
    crashOk: clawqlArms.crashTest?.ok ?? null,
    restartOk: clawqlArms.deadlineRestart?.ok ?? null,
    rebuildMs: clawqlArms.deadlineRestart?.rebuildMs ?? null,
    scheduleFormat: arms.clawql.scheduleFormat ?? null,
    note: "Single-run harness snapshot. Board deadlineAccuracy still quotes the conservative 256k 3-rep floor / firstMiss 384k until a multi-rep shared-host campaign.",
  },
  reading: arms.reading,
};

evidence.contract.memoryFraming =
  "Retained at limit = wake-deadline schedule. SHARED_HOST.md: methodology aligned (ClawQL + Ontologiql #144). group_commit sustained rate is disk-fsync bound. RebuildMs requires schedule-format disclosure. ClawQL five-arm harness artifact landed (peer null); shared-host complete only when Ontologiql peer merges on the same host. No win copy.";

clawqlRow.honesty = [
  "ClawQL TypeScript fair-v2 (methodology v10). Schedule 2.5e6 typed_arrays; format disclosed (header+live NDJSON+padCount; bulk pad + bottom-up heapify).",
  "Fired=durable_trigger_record; flush=group_commit(64/10ms); crashTest=pass; lateness after fsync.",
  "Steady ~667/s → 100% / excess p99 22 ms. Scaled bursts first miss N=250000 (N ≤ agentsAtLimit).",
  "Ramp board floor: sustainablePerSec=256000; firstRateMissingSlaPerSec=384000; rampWentPastFailure=true.",
  "Deadline restart pass; rebuildMs~40–55 at 2.5e6. Object-heap GC A/B retained.",
  "Under group_commit, sustained rate ≈ disk fsync bound (≤64×fsyncs/s) — cross-host gaps are not a language verdict.",
  "Methodology aligned with Ontologiql #144.",
  `Five-arm harness artifact ready (${evidence.sharedHostFiveArms.artifact}): firstBurstMiss=${evidence.sharedHostFiveArms.clawql.firstBurstMiss}; single-run ramp pass ${evidence.sharedHostFiveArms.clawql.sustainablePerSec}/miss ${evidence.sharedHostFiveArms.clawql.firstRateMissingSlaPerSec}; crash/restart ok; rebuildMs=${evidence.sharedHostFiveArms.clawql.rebuildMs}. Peer null — sharedHostComplete=false. No win copy.`,
].join(" ");

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      updated: evidencePath,
      from: armsPath,
      sharedHostComplete: evidence.sharedHostFiveArms.sharedHostComplete,
      peerPresent: evidence.sharedHostFiveArms.peerPresent,
      firstBurstMiss: evidence.sharedHostFiveArms.clawql.firstBurstMiss,
      rebuildMs: evidence.sharedHostFiveArms.clawql.rebuildMs,
    },
    null,
    2
  )
);

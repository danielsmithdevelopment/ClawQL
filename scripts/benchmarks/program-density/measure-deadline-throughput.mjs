/**
 * Focused deadline throughput measure at a claimed resident heap size.
 * Writes JSON to stdout (and optional --out path).
 *
 *   node --expose-gc --import tsx scripts/benchmarks/program-density/measure-deadline-throughput.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  openTriggerJournalEffect,
  runDeadlineAccuracyEffect,
} from "../../../packages/clawql-api/src/program/density/deadline-schedule.ts";
import { percentileMsEffect } from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const outPath =
  outArg ||
  join(repoRoot, "docs/benchmarks/program-density/deadline-throughput-latest.json");

const residentHeapSize = Number(process.env.CLAWQL_DENSITY_RESIDENT_HEAP || 2_500_000);
const maxFires = Number(process.env.CLAWQL_DENSITY_DEADLINE_MAX_FIRES || 2_000);
const horizonMs = Number(process.env.CLAWQL_DENSITY_DEADLINE_HORIZON_MS || 3_000);
const concurrency = Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 64);
const journalDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-bags-fair";

const sampleIds = Array.from(
  { length: maxFires },
  (_, i) => `bag_${i.toString(16).padStart(8, "0")}_throughput`
);

const report = await Effect.runPromise(
  Effect.gen(function* () {
    const journal = yield* openTriggerJournalEffect(journalDir);
    try {
      return yield* runDeadlineAccuracyEffect({
        agentIds: sampleIds,
        fire: async (entry, firedAt) => {
          journal.record(entry.agentId, entry.deadlineMs, firedAt);
        },
        horizonMs,
        slaMs: 1_000,
        slaTargetPct: 99,
        concurrency,
        firedDefinition: "durable_trigger_record",
        residentHeapSize,
        rampWindowMs: 1_000,
        // Ramp until first rate below 99% within 1s (sustainable ceiling).
        rampRatesPerSec: [
          500, 2_000, 8_000, 32_000, 128_000, 400_000, 512_000, 800_000, 1_000_000, 1_200_000,
          1_300_000, 1_600_000,
        ],
        percentile: (samples, p) => Effect.runSync(percentileMsEffect(samples, p)),
      });
    } finally {
      journal.close();
    }
  })
);

const payload = {
  measuredAt: new Date().toISOString(),
  residentHeapSize,
  maxFires,
  horizonMs,
  concurrency,
  firedDefinition: "durable_trigger_record",
  report,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(
  JSON.stringify(
    {
      outPath,
      residentHeapSize,
      sustainablePerSec: report.sustainablePerSec,
      steady: {
        arrivalRatePerSec: report.steady.arrivalRatePerSec,
        pctWithinSla: report.steady.pctWithinSla,
        excessP99: report.steady.excessOverTickP99Ms,
        wallMs: report.steady.wallMs,
      },
      burst: {
        drainPerSec: report.burst.arrivalRatePerSec,
        pctWithinSla: report.burst.pctWithinSla,
        excessP99: report.burst.excessOverTickP99Ms,
        wallMs: report.burst.wallMs,
      },
      ramp: report.ramp.map((a) => ({
        arrivalRatePerSec: a.arrivalRatePerSec,
        pctWithinSla: a.pctWithinSla,
        excessP99: a.excessOverTickP99Ms,
      })),
      scheduler: report.scheduler,
    },
    null,
    2
  ) + "\n"
);

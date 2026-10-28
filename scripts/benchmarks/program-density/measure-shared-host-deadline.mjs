/**
 * SHARED_HOST deadline arms: scaled bursts (Ontologiql sizes) + deadline restart
 * at full-scale capacity. Writes JSON to --out=.
 *
 *   node --expose-gc --import tsx scripts/benchmarks/program-density/measure-shared-host-deadline.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import {
  DEFAULT_SCALED_BURST_SIZES,
  DEFAULT_TRIGGER_FLUSH_POLICY,
  openTriggerJournalEffect,
  runScaledBurstLadderEffect,
} from "../../../packages/clawql-api/src/program/density/deadline-schedule.ts";
import { runDeadlineRestartTestEffect } from "../../../packages/clawql-api/src/program/density/deadline-restart.ts";
import { percentileMsEffect } from "../../../packages/clawql-api/src/program/density/host-metrics.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const outPath = outArg || "/opt/cursor/artifacts/deadline-shared-host-arms.json";

const capacity = Number(process.env.CLAWQL_DENSITY_RESIDENT_HEAP || 2_500_000);
const liveCount = Number(process.env.CLAWQL_DENSITY_RESTART_LIVE || 10_000);
const concurrency = Number(process.env.CLAWQL_DENSITY_DEADLINE_CONCURRENCY || 64);
const journalDir = process.env.CLAWQL_DENSITY_BAG_DIR || "/tmp/clawql-density-bags-fair";
const skipRestart = process.env.CLAWQL_DENSITY_SKIP_DEADLINE_RESTART === "1";
const skipScaled = process.env.CLAWQL_DENSITY_SKIP_SCALED_BURSTS === "1";
const sizesEnv = process.env.CLAWQL_DENSITY_SCALED_BURST_SIZES;
const sizes = sizesEnv
  ? sizesEnv.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
  : [...DEFAULT_SCALED_BURST_SIZES];

const flushPolicy = {
  mode: "group_commit",
  batchMax: Number(process.env.CLAWQL_DENSITY_FLUSH_BATCH_MAX || 64),
  flushIntervalMs: Number(process.env.CLAWQL_DENSITY_FLUSH_INTERVAL_MS || 10),
};

const pct = (samples, p) => Effect.runSync(percentileMsEffect(samples, p));

const payload = await Effect.runPromise(
  Effect.gen(function* () {
    let scaledBursts = null;
    if (!skipScaled) {
      const scaledDir = join(journalDir, ".scaled");
      mkdirSync(scaledDir, { recursive: true });
      const journal = yield* openTriggerJournalEffect(scaledDir, flushPolicy);
      try {
        scaledBursts = yield* runScaledBurstLadderEffect({
          fire: async (entry) => {
            await journal.record(entry.agentId, entry.deadlineMs);
          },
          sizes,
          slaMs: 1_000,
          slaTargetPct: 99,
          concurrency,
          // Pad each arm to claimed resident size so next-deadline cost matches limit.
          residentHeapSize: capacity,
          scheduleShape: "typed_arrays",
          percentile: pct,
        });
      } finally {
        yield* Effect.promise(() => journal.close());
      }
    }

    let deadlineRestart = null;
    if (!skipRestart) {
      deadlineRestart = yield* runDeadlineRestartTestEffect({
        workDir: join(journalDir, ".deadline-restart-measure"),
        capacity,
        liveCount: Math.min(liveCount, capacity),
        downtimeMs: 500,
        policy: flushPolicy,
        concurrency,
        catchUpSlaMs: 1_000,
        percentile: pct,
      });
    }

    return {
      measuredAt: new Date().toISOString(),
      flushPolicy: flushPolicy ?? DEFAULT_TRIGGER_FLUSH_POLICY,
      capacity,
      scaledBursts,
      deadlineRestart,
      reading: {
        firstMissSize: scaledBursts?.firstMissSize ?? null,
        restartOk: deadlineRestart?.ok ?? null,
        rebuildMs: deadlineRestart?.rebuildMs ?? null,
        note: "SHARED_HOST ClawQL arms — compare to Ontologiql once flush policy is disclosed + crash-tested on the same host.",
      },
    };
  })
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload.reading, null, 2));
console.log(`wrote ${outPath}`);

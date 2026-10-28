/**
 * Durability comparison board — crash during an outside write.
 * Dual columns × upstream modes × agent policies × arms.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import {
  clawqlAlwaysRetryArm,
  clawqlCheckThenDecideArm,
  clawqlFileJournalArm,
  naiveRetryArm,
} from "./file-journal-arm.js";
import {
  golemArm,
  golemClawqlArm,
  piDurableAlwaysRetryArm,
  piDurableClawqlArm,
  piDurableNeverRetryArm,
  piDurableRealModelArm,
  programCelldArm,
} from "./peer-stub-arms.js";
import type { ArmResult, ComparisonEvidence, DurabilityArm } from "./types.js";

const DEFAULT_ARMS: readonly DurabilityArm[] = [
  clawqlFileJournalArm,
  clawqlAlwaysRetryArm,
  clawqlCheckThenDecideArm,
  naiveRetryArm,
  programCelldArm,
  piDurableNeverRetryArm,
  piDurableAlwaysRetryArm,
  piDurableRealModelArm,
  golemArm,
  piDurableClawqlArm,
  golemClawqlArm,
];

export function parseComparisonN(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.DURABILITY_COMPARISON_N?.trim() || env.KILL_MID_WRITE_N?.trim();
  if (!raw) return 20;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 10_000) {
    throw new Error(`DURABILITY_COMPARISON_N must be 1..10000 (got ${raw})`);
  }
  return Math.floor(n);
}

export function runDurabilityComparisonBoardEffect(
  env: NodeJS.ProcessEnv = process.env,
  arms: readonly DurabilityArm[] = DEFAULT_ARMS
): Effect.Effect<ComparisonEvidence> {
  const n = parseComparisonN(env);
  const includeNaive = env.DURABILITY_COMPARISON_INCLUDE_NAIVE !== "0";
  const selected = arms.filter((a) => includeNaive || a.id !== "naive-retry");

  return Effect.gen(function* () {
    const results: ArmResult[] = [];
    for (const arm of selected) {
      results.push(yield* arm.run({ n }));
    }
    const clawql = results.find((a) => a.armId === "clawql-file-journal");
    const clawqlAlways = results.find((a) => a.armId === "clawql-always-retry");
    const clawqlAtMostOnce =
      clawql?.status === "measured" &&
      clawql.modes.length === 2 &&
      clawql.modes.every((m) => m.harnessValid && m.duplicates === 0) &&
      (clawqlAlways === undefined ||
        (clawqlAlways.status === "measured" &&
          clawqlAlways.modes.every((m) => m.harnessValid && m.duplicates === 0)));

    return {
      kind: "durability-comparison-crash-during-outside-write" as const,
      crashPoint: "outside_write_in_flight" as const,
      crashPointNote:
        "Every trial deliberately crashes after the outside write is visible and before its result is recorded — the hardest window. This is one row of a five-row crash-point board, not a claim that peers always double-charge.",
      otherCrashPointsNotMeasured: [
        "before_write_sent",
        "after_write_acked",
        "idle_between_steps",
        "during_model_tool_round",
      ] as const,
      measuredAt: new Date().toISOString(),
      metric:
        "duplicates + interrupted_or_unknown + completed_exactly_once; both upstream modes; agent policies (never/always/real/structural)" as const,
      honesty:
        "Crash-during-outside-write board. ClawQL structural refusal vs Pi Durable model-dependent retry. harnessValid = protocol ran correctly, not product-goodness. Pi zero-dup never-retry depends on the faux model; always-retry shows the worst case. Named public co-branded boards still need maintainer invite.",
      arms: results,
      clawqlAtMostOnce,
    } satisfies ComparisonEvidence;
  });
}

export function defaultComparisonEvidencePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DURABILITY_COMPARISON_EVIDENCE_PATH?.trim()) {
    return env.DURABILITY_COMPARISON_EVIDENCE_PATH.trim();
  }
  return join(process.cwd(), "docs/benchmarks/durability-proof/comparison/evidence.json");
}

export function writeComparisonEvidence(
  evidence: ComparisonEvidence,
  path: string = defaultComparisonEvidencePath()
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}

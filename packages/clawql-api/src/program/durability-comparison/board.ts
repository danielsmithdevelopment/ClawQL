/**
 * Durability comparison board — dual columns × upstream modes × arms.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import { clawqlFileJournalArm, naiveRetryArm } from "./file-journal-arm.js";
import {
  golemArm,
  golemClawqlArm,
  piDurableArm,
  piDurableClawqlArm,
  programCelldArm,
} from "./peer-stub-arms.js";
import type { ArmResult, ComparisonEvidence, DurabilityArm } from "./types.js";

const DEFAULT_ARMS: readonly DurabilityArm[] = [
  clawqlFileJournalArm,
  naiveRetryArm,
  programCelldArm,
  piDurableArm,
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
    const clawqlBoardPass =
      clawql?.status === "measured" &&
      clawql.modes.length === 2 &&
      clawql.modes.every((m) => m.boardPass && m.duplicates === 0);

    return {
      kind: "durability-comparison-kill-mid-write" as const,
      measuredAt: new Date().toISOString(),
      metric: "duplicates + outcome_unknown (+ lost); both upstream modes" as const,
      honesty:
        "ClawQL arms measured in-process. celld = own substrate (Tier B/C separate). Pi Durable / Golem live arms require DURABILITY_COMPARISON_LIVE_PEERS=1 (local golem server + @earendil-works/pi-durable). Named public peer boards still need maintainer invite before marketing as third-party measured.",
      arms: results,
      clawqlBoardPass,
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

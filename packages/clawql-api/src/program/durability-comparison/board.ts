/**
 * Durability comparison board — dual columns × upstream modes × arms (schema v2).
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import {
  COMPARISON_PACKAGE_ID,
  TIP_RUNTIME,
  TIP_RUNTIME_VERSION,
} from "./constants.js";
import { clawqlFileJournalArm, naiveRetryArm } from "./file-journal-arm.js";
import { buildComparisonPackageManifest } from "./manifest.js";
import {
  golemArm,
  golemClawqlArm,
  piDurableArm,
  piDurableClawqlArm,
  programCelldArm,
  programCelldStaleOwnerArm,
} from "./peer-stub-arms.js";
import type { ArmResult, ComparisonEvidence, DurabilityArm } from "./types.js";

export { COMPARISON_PACKAGE_ID, TIP_RUNTIME, TIP_RUNTIME_VERSION };

const DEFAULT_ARMS: readonly DurabilityArm[] = [
  clawqlFileJournalArm,
  naiveRetryArm,
  programCelldArm,
  programCelldStaleOwnerArm,
  piDurableArm,
  golemArm,
  piDurableClawqlArm,
  golemClawqlArm,
];

/** Package default N=50 so ClawQL rows match peer pilot denominators. */
export function parseComparisonN(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.DURABILITY_COMPARISON_N?.trim() || env.KILL_MID_WRITE_N?.trim();
  if (!raw) return 50;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 10_000) {
    throw new Error(`DURABILITY_COMPARISON_N must be 1..10000 (got ${raw})`);
  }
  return Math.floor(n);
}

export function detectHarnessCommit(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.DURABILITY_COMPARISON_HARNESS_COMMIT?.trim();
  if (override) return override;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function flattenArmResults(raw: ArmResult | readonly ArmResult[]): ArmResult[] {
  return Array.isArray(raw) ? [...raw] : [raw];
}

export function runDurabilityComparisonBoardEffect(
  env: NodeJS.ProcessEnv = process.env,
  arms: readonly DurabilityArm[] = DEFAULT_ARMS
): Effect.Effect<ComparisonEvidence> {
  const n = parseComparisonN(env);
  const harnessCommit = detectHarnessCommit(env);
  const includeNaive = env.DURABILITY_COMPARISON_INCLUDE_NAIVE !== "0";
  const selected = arms.filter((a) => includeNaive || a.id !== "naive-retry");

  return Effect.gen(function* () {
    const results: ArmResult[] = [];
    for (const arm of selected) {
      results.push(...flattenArmResults(yield* arm.run({ n, harnessCommit })));
    }
    const clawql = results.find(
      (a) => a.armId === "clawql-file-journal" && a.crashPhase === "during_call"
    );
    const clawqlBoardPass =
      clawql?.status === "measured" &&
      clawql.modes.length === 2 &&
      clawql.modes.every(
        (m) =>
          m.boardPass &&
          m.duplicates === 0 &&
          m.intentPresentOnResume === m.n &&
          m.callVerifiedSent === m.n &&
          m.n === n
      );

    return {
      kind: "durability-comparison-kill-mid-write" as const,
      schemaVersion: 2 as const,
      packageId: COMPARISON_PACKAGE_ID,
      measuredAt: new Date().toISOString(),
      harnessCommit,
      defaultN: n,
      metric:
        "duplicates + outcome_unknown (+ lost) + intentPresentOnResume + callVerifiedSent; both upstream modes" as const,
      honesty:
        "Schema v2 tip package on stock celld 0.6.3. Default N=50 (ClawQL rows match peer pilot denominators). Wedged-owner and stale-owner are separate rows from during_call. Peer arms share harnessCommit with null metrics until adapters run on this tip — include N=50 pilots in the config-review package.",
      tipRuntime: TIP_RUNTIME,
      tipRuntimeVersion: TIP_RUNTIME_VERSION,
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

export function defaultComparisonManifestPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DURABILITY_COMPARISON_MANIFEST_PATH?.trim()) {
    return env.DURABILITY_COMPARISON_MANIFEST_PATH.trim();
  }
  return join(process.cwd(), "docs/benchmarks/durability-proof/comparison/manifest.json");
}

export function writeComparisonEvidence(
  evidence: ComparisonEvidence,
  path: string = defaultComparisonEvidencePath()
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}

export function writeComparisonManifest(
  evidence: ComparisonEvidence,
  path: string = defaultComparisonManifestPath()
): string {
  const manifest = buildComparisonPackageManifest(evidence);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return path;
}

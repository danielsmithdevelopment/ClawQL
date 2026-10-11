/**
 * Convert frozen held-out routing cases → fan-out / flip-rate shapes (v0.1).
 * Measure path for Decision-1 — does not light productionTrusted.
 */

import { Context, Effect, Layer } from "effect";
import type { HeldOutCaseSpec, HeldOutSuiteManifest } from "clawql-core/classifier";
import type { FanoutEvalCase } from "./fanout-eval.js";
import type { FlipRateCase } from "./flip-rate.js";

export type FrontierLabelRow = {
  readonly caseId: string;
  readonly groundTruthCandidateId: string;
  readonly adjudicated?: boolean;
};

export type FrontierLabelsFile = {
  readonly labels?: readonly FrontierLabelRow[];
  readonly cases?: readonly FrontierLabelRow[];
};

function candidateDescription(features: Record<string, unknown>): string | undefined {
  const d = features.description;
  if (typeof d === "string" && d.trim()) return d.trim();
  const label = features.label;
  if (typeof label === "string" && label.trim()) return label.trim();
  return undefined;
}

/** Overlay frontier GT labels onto a provisional suite (labels win). */
export function applyFrontierLabels(
  suite: HeldOutSuiteManifest,
  labelsFile: FrontierLabelsFile
): Effect.Effect<HeldOutSuiteManifest | { error: string }> {
  return Effect.sync(() => {
    const rows = labelsFile.labels ?? labelsFile.cases ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return { error: "frontier labels must include a non-empty labels or cases array" };
    }
    const byId = new Map<string, FrontierLabelRow>();
    for (const row of rows) {
      if (!row || typeof row.caseId !== "string" || !row.caseId.trim()) {
        return { error: "each frontier label requires caseId" };
      }
      if (
        typeof row.groundTruthCandidateId !== "string" ||
        !row.groundTruthCandidateId.trim()
      ) {
        return { error: `label ${row.caseId}: groundTruthCandidateId required` };
      }
      byId.set(row.caseId.trim(), row);
    }
    const cases: HeldOutCaseSpec[] = [];
    for (const c of suite.cases) {
      const hit = byId.get(c.caseId);
      if (!hit) {
        cases.push(c);
        continue;
      }
      cases.push({
        ...c,
        groundTruthCandidateId: hit.groundTruthCandidateId.trim(),
        adjudicated: hit.adjudicated !== false,
        adjudicationKind: "live",
      });
    }
    return { ...suite, cases };
  });
}

/** Map one held-out case → labeled fan-out bulk case. */
export function heldOutCaseToFanout(
  c: HeldOutCaseSpec
): Effect.Effect<FanoutEvalCase | { error: string }> {
  return Effect.sync(() => {
    const caseId = c.caseId?.trim();
    const state = c.query?.trim();
    if (!caseId || !state) return { error: "held-out case requires caseId and query" };
    if (!Array.isArray(c.candidates) || c.candidates.length === 0) {
      return { error: `case ${caseId}: candidates required` };
    }
    const gt = c.groundTruthCandidateId?.trim();
    if (!gt) return { error: `case ${caseId}: groundTruthCandidateId required` };
    const options = c.candidates.map((cand) => {
      const id = cand.candidateId?.trim();
      if (!id) return null;
      return {
        id,
        description: candidateDescription(cand.features ?? {}),
      };
    });
    if (options.some((o) => o === null)) {
      return { error: `case ${caseId}: each candidate requires candidateId` };
    }
    const ids = new Set(options.map((o) => o!.id));
    if (!ids.has(gt)) {
      return {
        error: `case ${caseId}: groundTruthCandidateId '${gt}' not in candidates`,
      };
    }
    return {
      caseId,
      state,
      useSiteId: c.useSiteId?.trim() || undefined,
      questions: [
        {
          type: "choice" as const,
          name: "route",
          instructions: "Select the best tool/route for this query.",
          options: options as Array<{ id: string; description?: string }>,
        },
      ],
      expected: [{ name: "route", answer: gt }],
    };
  });
}

export function heldOutCasesToFanout(
  cases: readonly HeldOutCaseSpec[]
): Effect.Effect<readonly FanoutEvalCase[] | { error: string }> {
  return Effect.gen(function* () {
    const out: FanoutEvalCase[] = [];
    for (const c of cases) {
      const mapped = yield* heldOutCaseToFanout(c);
      if ("error" in mapped) return mapped;
      out.push(mapped);
    }
    return out;
  });
}

export function heldOutCasesToFlipRate(
  cases: readonly HeldOutCaseSpec[]
): Effect.Effect<readonly FlipRateCase[] | { error: string }> {
  return Effect.gen(function* () {
    const fanout = yield* heldOutCasesToFanout(cases);
    if ("error" in fanout) return fanout;
    return fanout.map((c) => ({
      caseId: c.caseId,
      state: c.state,
      questions: c.questions,
      useSiteId: c.useSiteId,
    }));
  });
}

export class HeldOutToFanoutService extends Context.Service<
  HeldOutToFanoutService,
  {
    readonly applyLabels: (
      suite: HeldOutSuiteManifest,
      labels: FrontierLabelsFile
    ) => Effect.Effect<HeldOutSuiteManifest | { error: string }>;
    readonly toFanout: (
      cases: readonly HeldOutCaseSpec[]
    ) => Effect.Effect<readonly FanoutEvalCase[] | { error: string }>;
    readonly toFlipRate: (
      cases: readonly HeldOutCaseSpec[]
    ) => Effect.Effect<readonly FlipRateCase[] | { error: string }>;
  }
>()("clawql/inference/HeldOutToFanoutService") {}

export const HeldOutToFanoutLive: Layer.Layer<HeldOutToFanoutService> = Layer.succeed(
  HeldOutToFanoutService,
  {
    applyLabels: applyFrontierLabels,
    toFanout: heldOutCasesToFanout,
    toFlipRate: heldOutCasesToFlipRate,
  }
);

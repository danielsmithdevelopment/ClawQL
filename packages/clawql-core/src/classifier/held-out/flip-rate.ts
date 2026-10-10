/**
 * Held-out flip-rate / perturbation gate for productionTrusted (v0.1).
 * Perturb each case query, re-score via FastDecisionScorer, fail-closed when
 * top-candidate flips too often. Opt out: CLAWQL_FLIP_RATE_GATE=0.
 */

import { Context, Effect, Layer } from "effect";
import { FastDecisionScorer } from "../scorer.js";
import type { FastDecisionContext } from "../types.js";
import { candidatesEquivalent } from "../candidate-equivalence.js";
import { loadClawqlCapabilityOntology } from "../capability-ontology.js";
import { enrichFastDecisionRequest } from "../ontology-enrichment.js";
import { BUILTIN_FAST_DECISION_USE_SITES } from "../use-sites/builtins.js";
import type {
  HeldOutCaseSpec,
  HeldOutFlipRateCaseReport,
  HeldOutFlipRateFamily,
  HeldOutFlipRateReport,
} from "./types.js";

export type { HeldOutFlipRateCaseReport, HeldOutFlipRateFamily, HeldOutFlipRateReport };

const BUILTIN_TASK_FRAMING: ReadonlyMap<string, string> = new Map(
  BUILTIN_FAST_DECISION_USE_SITES.map((s) => [s.useSiteId, s.description])
);

function taskFramingForUseSite(useSiteId: string): string | undefined {
  return BUILTIN_TASK_FRAMING.get(useSiteId);
}

function ontologyEnrichmentEnabled(): boolean {
  const v = process.env.CLAWQL_FAST_DECISION_ONTOLOGY?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  return false;
}

export const DEFAULT_HELD_OUT_FLIP_RATE_FAMILIES: readonly HeldOutFlipRateFamily[] = [
  "whitespace",
  "case",
  "punctuation",
  "synonym",
];

/** Default: at most 10% of comparable perturbations may flip. */
export const DEFAULT_HELD_OUT_MAX_FLIP_RATE = 0.1;

const SYNONYM_SWAPS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcharged\b/gi, "billed"],
  [/\bbilled\b/gi, "charged"],
  [/\border\b/gi, "purchase"],
  [/\bpurchase\b/gi, "order"],
  [/\bpackage\b/gi, "parcel"],
  [/\bparcel\b/gi, "package"],
  [/\bcrack\b/gi, "fracture"],
  [/\bfracture\b/gi, "crack"],
  [/\bfails?\b/gi, "does not work"],
  [/\bdoes not work\b/gi, "fails"],
];

export type HeldOutFlipRatePerturbation = {
  readonly family: HeldOutFlipRateFamily;
  readonly label: string;
  readonly query: string;
};

export type HeldOutFlipRateOpts = {
  readonly maxFlipRate?: number;
  readonly families?: readonly HeldOutFlipRateFamily[];
};

/** Env opt-out — primary API is Effect (see flipRateGateEnabledEffect). */
export function readFlipRateGateEnabledFromEnv(): boolean {
  const v = process.env.CLAWQL_FLIP_RATE_GATE?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export function flipRateGateEnabledEffect(): Effect.Effect<boolean> {
  return Effect.sync(readFlipRateGateEnabledFromEnv);
}

export function applyQueryPerturbations(
  query: string,
  families: readonly HeldOutFlipRateFamily[] = DEFAULT_HELD_OUT_FLIP_RATE_FAMILIES
): Effect.Effect<readonly HeldOutFlipRatePerturbation[]> {
  return Effect.sync(() => {
    const out: HeldOutFlipRatePerturbation[] = [];
    const base = query;

    if (families.includes("whitespace")) {
      out.push({
        family: "whitespace",
        label: "collapse",
        query: base.replace(/\s+/g, " ").trim(),
      });
      out.push({ family: "whitespace", label: "pad", query: `  ${base.trim()}  ` });
    }
    if (families.includes("case")) {
      out.push({ family: "case", label: "lower", query: base.toLowerCase() });
      out.push({ family: "case", label: "upper", query: base.toUpperCase() });
      const titled = base.replace(/^\s*\w/, (ch) => ch.toUpperCase());
      out.push({ family: "case", label: "title_first", query: titled });
    }
    if (families.includes("punctuation")) {
      out.push({
        family: "punctuation",
        label: "strip_trail",
        query: base.replace(/[!?.]+$/g, "").trim(),
      });
      const stripped = base.replace(/[!?.]+$/g, "").trim();
      out.push({ family: "punctuation", label: "add_q", query: `${stripped}?` });
    }
    if (families.includes("synonym")) {
      for (let i = 0; i < SYNONYM_SWAPS.length; i++) {
        const [re, replacement] = SYNONYM_SWAPS[i]!;
        if (!re.test(base)) {
          re.lastIndex = 0;
          continue;
        }
        re.lastIndex = 0;
        const next = base.replace(re, replacement);
        if (next !== base) {
          out.push({ family: "synonym", label: `swap_${i}`, query: next });
        }
        re.lastIndex = 0;
      }
    }

    return out.filter((p) => p.query !== base || p.label === "pad");
  });
}

function topCandidateIdFromScores(
  scores: ReadonlyArray<{ candidateId: string; confidence: number }>
): string | undefined {
  const zeroSignal = scores.length > 0 && scores.every((s) => s.confidence <= 0);
  if (zeroSignal) return undefined;
  const top = [...scores].sort((a, b) => b.confidence - a.confidence)[0];
  return top?.candidateId;
}

function ctxForQuery(caseId: string, query: string): FastDecisionContext {
  return {
    sessionId: `held-out-flip:${caseId}`,
    query,
    extras: { heldOutCaseId: caseId, text: query, flipRate: true },
  };
}

/**
 * Score held-out cases under deterministic query perturbations.
 * Suite passes only when every case answered a baseline and flipRate ≤ max.
 */
export function evaluateHeldOutFlipRate(
  cases: readonly HeldOutCaseSpec[],
  opts: HeldOutFlipRateOpts = {}
): Effect.Effect<HeldOutFlipRateReport, never, FastDecisionScorer> {
  return Effect.gen(function* () {
    const enabled = yield* flipRateGateEnabledEffect();
    const maxFlipRate = opts.maxFlipRate ?? DEFAULT_HELD_OUT_MAX_FLIP_RATE;
    const families = opts.families ?? DEFAULT_HELD_OUT_FLIP_RATE_FAMILIES;
    if (!enabled) {
      return {
        maxFlipRate,
        families: [...families],
        caseCount: cases.length,
        passed: true,
        skipped: true,
        reports: [],
      };
    }

    const scorer = yield* FastDecisionScorer;
    const ontology = ontologyEnrichmentEnabled()
      ? yield* Effect.sync(() => {
          try {
            return loadClawqlCapabilityOntology();
          } catch {
            return undefined;
          }
        })
      : undefined;

    const reports: HeldOutFlipRateCaseReport[] = [];

    for (const c of cases) {
      const scoreQuery = (query: string) =>
        Effect.gen(function* () {
          const baseCtx = ctxForQuery(c.caseId, query);
          const enriched = ontology
            ? enrichFastDecisionRequest({
                ctx: baseCtx,
                candidates: c.candidates,
                ontology,
              })
            : { ctx: baseCtx, candidates: c.candidates };
          const scores = yield* scorer.score({
            useSiteId: c.useSiteId,
            ctx: enriched.ctx,
            candidates: enriched.candidates,
            taskFraming: taskFramingForUseSite(c.useSiteId),
            capabilityOntology: ontology,
          });
          return topCandidateIdFromScores(scores);
        });

      const baseline = (yield* scoreQuery(c.query)) ?? null;
      const perturbations = yield* applyQueryPerturbations(c.query, families);
      let comparable = 0;
      let flips = 0;

      for (const p of perturbations) {
        const answer = (yield* scoreQuery(p.query)) ?? null;
        if (baseline === null || answer === null) continue;
        comparable += 1;
        if (!candidatesEquivalent(answer, baseline)) flips += 1;
      }

      const flipRate = comparable === 0 ? 0 : flips / comparable;
      const passed = baseline !== null && flipRate <= maxFlipRate;
      reports.push({
        caseId: c.caseId,
        baseline,
        perturbations: comparable,
        flips,
        flipRate,
        passed,
      });
    }

    return {
      maxFlipRate,
      families: [...families],
      caseCount: cases.length,
      passed: reports.length > 0 && reports.every((r) => r.passed),
      skipped: false,
      reports,
    };
  });
}

export class HeldOutFlipRateGate extends Context.Service<
  HeldOutFlipRateGate,
  {
    readonly evaluate: (
      cases: readonly HeldOutCaseSpec[],
      opts?: HeldOutFlipRateOpts
    ) => Effect.Effect<HeldOutFlipRateReport>;
  }
>()("clawql/HeldOutFlipRateGate") {}

export function makeHeldOutFlipRateGateLive(): Layer.Layer<HeldOutFlipRateGate, never, FastDecisionScorer> {
  return Layer.effect(
    HeldOutFlipRateGate,
    Effect.gen(function* () {
      const scorer = yield* FastDecisionScorer;
      const scorerLayer = Layer.succeed(FastDecisionScorer, scorer);
      return {
        evaluate: (cases, opts) =>
          evaluateHeldOutFlipRate(cases, opts).pipe(Effect.provide(scorerLayer)),
      };
    })
  );
}

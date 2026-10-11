/**
 * Decision-1 candidate readout on frozen routing held-out (measure-only).
 * Always emits productionTrustedClaim: false — never lights trust.
 */

import { Context, Effect, Layer } from "effect";
import type { HeldOutSuiteManifest } from "clawql-core/classifier";
import { runFanoutEval, type FanoutEvalRequest, type FanoutEvalResponse } from "./fanout-eval.js";
import { runFlipRate, type FlipRateRequest, type FlipRateResponse } from "./flip-rate.js";
import {
  applyFrontierLabels,
  heldOutCasesToFanout,
  heldOutCasesToFlipRate,
  type FrontierLabelsFile,
} from "./held-out-to-fanout.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";
import type { DecisionRequest, DecisionResponse } from "./service.js";

export const DECISION1_CANDIDATE_PROTOCOL =
  "Decision-1 candidate on frozen routing held-out; fan-out bulk + flip-rate pin; not productionTrusted";

export type Decision1CandidateReport = {
  readonly protocol: typeof DECISION1_CANDIDATE_PROTOCOL;
  readonly evalSuite: string;
  readonly labelCount: number;
  readonly groundTruthSource: "frontier_labels" | "suite_provisional";
  readonly backends: readonly { readonly id: string; readonly model: string }[];
  readonly bulk: {
    readonly qualityBar: { readonly maxWrongAnswers: number; readonly minAnswered: number };
    readonly reports: FanoutEvalResponse["reports"];
    readonly recommendation: FanoutEvalResponse["recommendation"];
    readonly disagreements: FanoutEvalResponse["disagreements"];
  };
  readonly flipRate: {
    readonly model: string;
    readonly backendId: string;
    readonly maxFlipRate: number;
    readonly passed: boolean;
    readonly caseCount: number;
    readonly reports: FlipRateResponse["reports"];
    /** True when OpenRouter key missing / flip suite skipped (measure still emits). */
    readonly skipped?: boolean;
    readonly skipReason?: string;
  };
  readonly honesty: readonly string[];
  readonly verdict: {
    readonly productionTrustedClaim: false;
    readonly calibratedClaim: false;
    readonly citeAs: string;
  };
};

export type Decision1CandidateDeps = {
  readonly suite: HeldOutSuiteManifest;
  readonly labels?: FrontierLabelsFile;
  readonly decide?: (req: DecisionRequest) => Promise<DecisionResponse>;
  readonly callOpenRouter?: (
    body: OpenAiDecisionCreateRequest
  ) => Promise<OpenAiDecisionCreateResponse>;
  readonly env?: NodeJS.ProcessEnv;
  readonly maxFlipRate?: number;
  /** Override flip-rate families (default full suite; use `["synonym"]` to cut spend). */
  readonly flipFamilies?: FlipRateRequest["families"];
  /**
   * When true (default), missing OpenRouter still emits bulk + flipRate.skipped
   * instead of hard-failing the whole report.
   */
  readonly allowMissingOpenRouter?: boolean;
  /** Injected for tests — defaults to runFanoutEval. */
  readonly runBulk?: (req: FanoutEvalRequest) => Promise<FanoutEvalResponse>;
  /** Injected for tests — defaults to runFlipRate. */
  readonly runFlip?: (
    req: FlipRateRequest,
    opts?: {
      decide?: (req: DecisionRequest) => Promise<DecisionResponse>;
      callOpenRouter?: (body: OpenAiDecisionCreateRequest) => Promise<OpenAiDecisionCreateResponse>;
      env?: NodeJS.ProcessEnv;
    }
  ) => Promise<FlipRateResponse>;
};

const DEFAULT_BACKENDS = [
  { id: "local", model: "clawql" },
  {
    id: "openrouter/microsoft/microsoft-decision-1",
    model: "microsoft/microsoft-decision-1",
  },
] as const;

const HONESTY = [
  "measure-only — reuses fan-out bulk + flip-rate model pin",
  "bulk correctness is exact option id match (not twin-aware held-out scoring)",
  "does not light calibrated or held-out productionTrusted (still GLiNER2-only)",
] as const;

export function buildDecision1CandidateReport(
  deps: Decision1CandidateDeps
): Effect.Effect<Decision1CandidateReport | { error: string }> {
  return Effect.gen(function* () {
    let suite = deps.suite;
    let groundTruthSource: Decision1CandidateReport["groundTruthSource"] = "suite_provisional";
    if (deps.labels) {
      const labeled = yield* applyFrontierLabels(suite, deps.labels);
      if ("error" in labeled) return labeled;
      suite = labeled;
      groundTruthSource = "frontier_labels";
    }

    const fanoutCases = yield* heldOutCasesToFanout(suite.cases);
    if ("error" in fanoutCases) return fanoutCases;
    const flipCases = yield* heldOutCasesToFlipRate(suite.cases);
    if ("error" in flipCases) return flipCases;

    const qualityBar = { maxWrongAnswers: 0, minAnswered: 1 } as const;
    const bulkReq: FanoutEvalRequest = {
      mode: "bulk",
      useSiteId: "search_provider_tool_routing",
      qualityBar: { ...qualityBar },
      backends: [...DEFAULT_BACKENDS],
      cases: fanoutCases,
    };

    const runBulk =
      deps.runBulk ??
      ((req: FanoutEvalRequest) =>
        runFanoutEval(req, {
          decide: deps.decide,
          callOpenRouter: deps.callOpenRouter,
          env: deps.env,
        }));

    const bulk = yield* Effect.tryPromise({
      try: () => runBulk(bulkReq),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(
      Effect.catch((e) => Effect.succeed({ error: `bulk fan-out failed: ${e.message}` } as const))
    );
    if ("error" in bulk) return bulk;

    const maxFlipRate = deps.maxFlipRate ?? 0.1;
    const flipFamilies = deps.flipFamilies ?? ["whitespace", "case", "punctuation", "synonym"];
    const flipReq: FlipRateRequest = {
      cases: flipCases,
      useSiteId: "search_provider_tool_routing",
      model: "microsoft-decision-1",
      maxFlipRate,
      families: flipFamilies,
    };

    const runFlip = deps.runFlip ?? runFlipRate;
    const allowMissing = deps.allowMissingOpenRouter !== false;
    const flipOrSkip = yield* Effect.tryPromise({
      try: () =>
        runFlip(flipReq, {
          decide: deps.decide,
          callOpenRouter: deps.callOpenRouter,
          env: deps.env,
        }),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(
      Effect.map((flip) => ({ kind: "ok" as const, flip })),
      Effect.catch((e) => {
        const msg = e.message;
        if (allowMissing && /OPENROUTER_API_KEY/i.test(msg)) {
          return Effect.succeed({
            kind: "skipped" as const,
            reason: msg,
          });
        }
        return Effect.succeed({ kind: "error" as const, error: `flip-rate failed: ${msg}` });
      })
    );
    if (flipOrSkip.kind === "error") return { error: flipOrSkip.error };

    const honesty = [...HONESTY];
    if (flipOrSkip.kind === "skipped") {
      honesty.push(`flip-rate skipped: ${flipOrSkip.reason}`);
    }

    const flipRateBlock =
      flipOrSkip.kind === "ok"
        ? {
            model: flipOrSkip.flip.model ?? "microsoft/microsoft-decision-1",
            backendId: flipOrSkip.flip.backendId,
            maxFlipRate: flipOrSkip.flip.maxFlipRate,
            passed: flipOrSkip.flip.passed,
            caseCount: flipOrSkip.flip.caseCount,
            reports: flipOrSkip.flip.reports,
          }
        : {
            model: "microsoft/microsoft-decision-1",
            backendId: "openrouter/microsoft/microsoft-decision-1",
            maxFlipRate,
            passed: false,
            caseCount: flipCases.length,
            reports: [] as FlipRateResponse["reports"],
            skipped: true,
            skipReason: flipOrSkip.reason,
          };

    return {
      protocol: DECISION1_CANDIDATE_PROTOCOL,
      evalSuite: suite.suiteId,
      labelCount: suite.cases.length,
      groundTruthSource,
      backends: [...DEFAULT_BACKENDS],
      bulk: {
        qualityBar: { ...qualityBar },
        reports: bulk.reports,
        recommendation: bulk.recommendation,
        disagreements: bulk.disagreements,
      },
      flipRate: flipRateBlock,
      honesty,
      verdict: {
        productionTrustedClaim: false,
        calibratedClaim: false,
        citeAs: "Decision-1 routing candidate readout — not a trusted path",
      },
    } satisfies Decision1CandidateReport;
  });
}

export class Decision1CandidateReportService extends Context.Service<
  Decision1CandidateReportService,
  {
    readonly build: (
      deps: Decision1CandidateDeps
    ) => Effect.Effect<Decision1CandidateReport | { error: string }>;
  }
>()("clawql/inference/Decision1CandidateReportService") {}

export const Decision1CandidateReportLive: Layer.Layer<Decision1CandidateReportService> =
  Layer.succeed(Decision1CandidateReportService, {
    build: buildDecision1CandidateReport,
  });

/** Host-boundary façade for operator / scripts. */
export function runDecision1CandidateReport(
  deps: Decision1CandidateDeps
): Promise<Decision1CandidateReport | { error: string }> {
  return Effect.runPromise(buildDecision1CandidateReport(deps));
}

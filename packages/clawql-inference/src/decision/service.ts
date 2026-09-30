/**
 * Decision gateway — Effect Tag wrapping Fast Decision for HTTP /decision.
 * Calibration honesty: only productionTrusted use sites may set calibrated=true
 * when the live scorer backend is gliner2.
 */

import { randomUUID } from "node:crypto";
import { Context, Effect, Layer, ManagedRuntime } from "effect";
import {
  FastDecisionDefaultStackLive,
  FastDecisionScorer,
  FastDecisionTestStackLive,
  runFastDecision,
  seedBuiltinUseSites,
  type FastDecisionCandidate,
  type FastDecisionContext,
  type FastDecisionResult,
} from "clawql-core/classifier";

/** Use sites that may return calibrated=true at 8.0.0 launch. */
export const PRODUCTION_TRUSTED_USE_SITES: ReadonlySet<string> = new Set([
  "search_provider_tool_routing",
]);

export type DecisionEscalationMode = "abstain" | "escalate";

export type DecisionChoiceOption = {
  readonly id: string;
  readonly description?: string;
};

export type DecisionChoiceQuestion = {
  readonly type: "choice";
  readonly name: string;
  readonly options: readonly DecisionChoiceOption[];
};

export type DecisionNoulQuestion = {
  readonly type: "noul";
  readonly name: string;
  readonly statement: string;
};

export type DecisionQuestion = DecisionChoiceQuestion | DecisionNoulQuestion;

export type DecisionRequest = {
  readonly state: string;
  readonly questions: readonly DecisionQuestion[];
  readonly useSiteId?: string;
  readonly escalation?: {
    readonly mode?: DecisionEscalationMode;
    readonly model?: string;
  };
  readonly sessionId?: string;
  readonly agentId?: string;
  readonly virtualKeyId?: string;
  readonly team?: string;
};

export type DecisionAnswer = {
  readonly name: string;
  readonly type: "choice" | "noul";
  readonly answer?: string;
  readonly probability?: number;
  readonly options?: Array<{ id: string; probability: number }>;
  readonly abstained: boolean;
  readonly escalated: boolean;
  readonly calibrated: boolean;
  readonly backendId: string;
  readonly useSiteId: string;
  readonly selectedConfidence?: number;
  readonly thresholdApplied?: number;
};

export type DecisionResponse = {
  readonly object: "clawql.decision";
  readonly answers: readonly DecisionAnswer[];
  readonly traceId: string;
  readonly escalated: boolean;
  readonly calibrated: boolean;
  readonly backendId: string;
  readonly escalationModel?: string;
};

export class DecisionGatewayService extends Context.Tag("clawql/inference/DecisionGatewayService")<
  DecisionGatewayService,
  {
    readonly decide: (req: DecisionRequest) => Effect.Effect<DecisionResponse>;
  }
>() {}

// Runtime R varies between GLiNER (prod) and heuristic (tests); keep loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DecisionStack = ManagedRuntime.ManagedRuntime<any, never>;

let decisionRuntime: DecisionStack | undefined;
let seedPromise: Promise<void> | undefined;

function getDecisionRuntime(): DecisionStack {
  if (!decisionRuntime) {
    decisionRuntime = ManagedRuntime.make(FastDecisionDefaultStackLive);
  }
  return decisionRuntime;
}

/** Swap in the heuristic Fast Decision stack (tests only). */
export function useHeuristicDecisionStackForTests(): void {
  if (decisionRuntime) {
    void decisionRuntime.dispose();
  }
  decisionRuntime = ManagedRuntime.make(FastDecisionTestStackLive);
  seedPromise = undefined;
}

/** Restore the default GLiNER stack after tests. */
export function resetDecisionRuntime(): void {
  if (decisionRuntime) {
    void decisionRuntime.dispose();
  }
  decisionRuntime = undefined;
  seedPromise = undefined;
}

async function ensureDecisionSeeded(): Promise<void> {
  const rt = getDecisionRuntime();
  if (!seedPromise) {
    seedPromise = rt.runPromise(seedBuiltinUseSites());
  }
  await seedPromise;
}

function extrasKeyForUseSite(useSiteId: string): string {
  if (useSiteId === "search_provider_tool_routing") return "providerToolCandidates";
  if (useSiteId === "skill_fast_path_match") return "skillCandidates";
  return "providerToolCandidates";
}

function candidatesFromChoice(q: DecisionChoiceQuestion): FastDecisionCandidate[] {
  return q.options.map((o) => {
    const text = o.description?.trim() || o.id;
    return {
      candidateId: o.id,
      features: {
        // Prefer human description for scoring (heuristic overlap + GLiNER labels).
        label: text,
        description: text,
        name: o.id,
      },
    };
  });
}

function noulCandidates(statement: string): FastDecisionCandidate[] {
  return [
    {
      candidateId: "true",
      features: { label: "true", description: statement },
    },
    {
      candidateId: "false",
      features: { label: "false", description: `Negation: ${statement}` },
    },
  ];
}

function softmaxNormalize(scores: readonly { candidateId: string; confidence: number }[]) {
  const max = Math.max(...scores.map((s) => s.confidence), 0);
  const exps = scores.map((s) => Math.exp((s.confidence - max) * 4));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return scores.map((s, i) => ({
    id: s.candidateId,
    probability: exps[i]! / sum,
  }));
}

function mapResult(opts: {
  question: DecisionQuestion;
  result: FastDecisionResult;
  backendId: string;
  useSiteId: string;
  escalationMode: DecisionEscalationMode;
}): DecisionAnswer {
  const calibrated =
    PRODUCTION_TRUSTED_USE_SITES.has(opts.useSiteId) && opts.backendId === "gliner2";
  const abstained = opts.result.outcome === "below_threshold_fallback";
  const escalated = abstained && opts.escalationMode === "escalate";
  const options = softmaxNormalize(opts.result.scores);

  if (opts.question.type === "noul") {
    const trueOpt = options.find((o) => o.id === "true");
    return {
      name: opts.question.name,
      type: "noul",
      probability: trueOpt?.probability ?? 0,
      answer: abstained ? undefined : opts.result.selectedCandidateId,
      abstained,
      escalated,
      calibrated,
      backendId: opts.backendId,
      useSiteId: opts.useSiteId,
      selectedConfidence: opts.result.selectedConfidence,
      thresholdApplied: opts.result.thresholdApplied,
      options,
    };
  }

  return {
    name: opts.question.name,
    type: "choice",
    answer: abstained ? undefined : opts.result.selectedCandidateId,
    options,
    abstained,
    escalated,
    calibrated,
    backendId: opts.backendId,
    useSiteId: opts.useSiteId,
    selectedConfidence: opts.result.selectedConfidence,
    thresholdApplied: opts.result.thresholdApplied,
  };
}

export const DecisionGatewayLive = Layer.succeed(DecisionGatewayService, {
  decide: (req) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => ensureDecisionSeeded());
      const rt = getDecisionRuntime();
      const traceId = randomUUID();
      const useSiteId = req.useSiteId?.trim() || "search_provider_tool_routing";
      const escalationMode: DecisionEscalationMode =
        req.escalation?.mode ??
        (PRODUCTION_TRUSTED_USE_SITES.has(useSiteId) ? "abstain" : "escalate");
      const answers: DecisionAnswer[] = [];
      let backendId = "unknown";
      let anyEscalated = false;
      let anyCalibrated = false;

      for (const question of req.questions) {
        const candidates =
          question.type === "choice"
            ? candidatesFromChoice(question)
            : noulCandidates(question.statement);
        const extrasKey = extrasKeyForUseSite(useSiteId);
        const ctx: FastDecisionContext = {
          sessionId: req.sessionId ?? `decision:${traceId}`,
          agentId: req.agentId,
          query: req.state,
          extras: {
            [extrasKey]: candidates,
            text: req.state,
            decisionQuestion: question.name,
            virtualKeyId: req.virtualKeyId,
            team: req.team,
            traceId,
          },
        };

        const { result, backendId: bid } = yield* Effect.promise(() =>
          rt.runPromise(
            Effect.gen(function* () {
              const scorer = yield* FastDecisionScorer;
              const result = yield* runFastDecision(useSiteId, ctx);
              return { result, backendId: scorer.backendId() };
            })
          )
        );
        backendId = bid;
        const answer = mapResult({
          question,
          result,
          backendId: bid,
          useSiteId,
          escalationMode,
        });
        if (answer.escalated) anyEscalated = true;
        if (answer.calibrated) anyCalibrated = true;
        answers.push(answer);
      }

      return {
        object: "clawql.decision" as const,
        answers,
        traceId,
        escalated: anyEscalated,
        calibrated: anyCalibrated,
        backendId,
        escalationModel: anyEscalated ? req.escalation?.model : undefined,
      };
    }),
});

export function runDecision(req: DecisionRequest): Promise<DecisionResponse> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* DecisionGatewayService;
      return yield* svc.decide(req);
    }).pipe(Effect.provide(DecisionGatewayLive))
  );
}

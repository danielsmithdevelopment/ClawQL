/**
 * Multi-backend decisions fan-out evaluation (bulk mode v0.1).
 * Runs labeled cases across backends and recommends the cheapest that meets
 * the honesty quality bar (answers-on-its-own @ max wrong answers).
 */

import { randomUUID } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import type { DecisionQuestion, DecisionRequest, DecisionResponse } from "./service.js";
import { runDecision } from "./service.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";
import { callRemoteOpenAiDecisions, remoteLunaAvailable } from "./remote-decisions.js";

export type FanoutEvalMode = "bulk";

export type FanoutExpectedAnswer = {
  readonly name: string;
  readonly answer: string;
};

export type FanoutEvalCase = {
  readonly caseId: string;
  readonly state: string;
  readonly questions: readonly DecisionQuestion[];
  readonly expected: readonly FanoutExpectedAnswer[];
  readonly useSiteId?: string;
};

export type FanoutBackendSpec = {
  readonly id: string;
  /** Model pin for local (`clawql` / `clawql-auto`) or Luna (`gpt-6-luna`). */
  readonly model?: string;
  /** Optional cost unit for recommendation (same currency across backends). */
  readonly costPerCase?: number;
};

export type FanoutQualityBar = {
  /** Default 0 — any wrong answer fails the bar (answers-on-its-own). */
  readonly maxWrongAnswers?: number;
  /** Default 1 — need at least this many non-abstain answers. */
  readonly minAnswered?: number;
};

export type FanoutEvalRequest = {
  readonly mode: FanoutEvalMode;
  readonly cases: readonly FanoutEvalCase[];
  readonly backends: readonly FanoutBackendSpec[];
  readonly useSiteId?: string;
  readonly qualityBar?: FanoutQualityBar;
};

export type FanoutBackendReport = {
  readonly backendId: string;
  readonly model?: string;
  readonly answered: number;
  readonly correct: number;
  readonly wrong: number;
  readonly abstained: number;
  readonly skipped: number;
  readonly answersOnItsOwn: number;
  readonly meetsQualityBar: boolean;
  readonly costEstimate?: number;
  readonly skipReason?: string;
};

export type FanoutDisagreement = {
  readonly caseId: string;
  readonly answers: Record<string, string | null>;
};

export type FanoutEvalResponse = {
  readonly object: "clawql.decision.fanout_eval";
  readonly mode: "bulk";
  readonly reports: readonly FanoutBackendReport[];
  readonly recommendation?: {
    readonly backendId: string;
    readonly reason: string;
  };
  readonly disagreements: readonly FanoutDisagreement[];
  readonly traceId: string;
  readonly caseCount: number;
};

export type FanoutDecideFn = (req: DecisionRequest) => Promise<DecisionResponse>;
export type FanoutRemoteFn = (
  body: OpenAiDecisionCreateRequest
) => Promise<OpenAiDecisionCreateResponse>;

function isLunaBackend(spec: FanoutBackendSpec): boolean {
  const id = spec.id.trim().toLowerCase();
  const model = (spec.model ?? "").trim().toLowerCase();
  return (
    id.includes("luna") || id.includes("openai") || model.includes("luna") || model === "gpt-6-luna"
  );
}

function selectedAnswer(result: DecisionResponse, questionName: string): string | null {
  const hit = result.answers.find((a) => a.name === questionName);
  if (!hit || hit.abstained) return null;
  if (hit.type === "noul") {
    if (hit.answer === "true" || hit.answer === "false") return hit.answer;
    if (typeof hit.probability === "number") return hit.probability >= 0.5 ? "true" : "false";
    return null;
  }
  return hit.answer ?? null;
}

function selectedFromOpenAi(
  remote: OpenAiDecisionCreateResponse,
  questionName: string
): string | null {
  const hit = remote.answers.find((a) => a.name === questionName);
  if (!hit || hit.type === "refusal") return null;
  if (hit.type === "choice") return String(hit.choice);
  if (hit.type === "predicate") return hit.probability >= 0.5 ? "true" : "false";
  if (hit.type === "score") return String(hit.score);
  return null;
}

function questionsToOpenAi(questions: readonly DecisionQuestion[]) {
  return questions.map((q) => {
    if (q.type === "noul") {
      return {
        type: "predicate" as const,
        name: q.name,
        instructions: q.statement,
      };
    }
    if (q.type === "score") {
      return {
        type: "score" as const,
        name: q.name,
        instructions: q.instructions ?? q.name,
        levels: q.levels.map((l) => ({
          label: l.label,
          description: l.description,
        })),
      };
    }
    return {
      type: "choice" as const,
      name: q.name,
      instructions: q.instructions ?? q.name,
      choices: q.options.map((o) => ({
        value: o.id,
        description: o.description,
      })),
    };
  });
}

export function parseFanoutEvalBody(body: unknown): FanoutEvalRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  if (b.mode !== "bulk") {
    return { error: "mode must be 'bulk' (disagreement_mining and ensemble are follow-ons)" };
  }
  if (!Array.isArray(b.cases) || b.cases.length === 0) {
    return { error: "cases must be a non-empty array" };
  }
  if (!Array.isArray(b.backends) || b.backends.length === 0) {
    return { error: "backends must be a non-empty array" };
  }

  const backends: FanoutBackendSpec[] = [];
  for (const raw of b.backends) {
    if (!raw || typeof raw !== "object") return { error: "each backend requires an id" };
    const bk = raw as Record<string, unknown>;
    const id = typeof bk.id === "string" ? bk.id.trim() : "";
    if (!id) return { error: "each backend requires an id" };
    backends.push({
      id,
      model: typeof bk.model === "string" ? bk.model : undefined,
      costPerCase: typeof bk.costPerCase === "number" ? bk.costPerCase : undefined,
    });
  }

  const cases: FanoutEvalCase[] = [];
  for (const raw of b.cases) {
    if (!raw || typeof raw !== "object")
      return { error: "each case requires caseId, state, questions, expected" };
    const c = raw as Record<string, unknown>;
    const caseId = typeof c.caseId === "string" ? c.caseId.trim() : "";
    const state = typeof c.state === "string" ? c.state.trim() : "";
    if (!caseId || !state) return { error: "each case requires caseId and state" };
    if (!Array.isArray(c.questions) || c.questions.length === 0) {
      return { error: `case ${caseId}: questions required` };
    }
    if (!Array.isArray(c.expected) || c.expected.length === 0) {
      return { error: `case ${caseId}: expected answers required` };
    }
    const questions: DecisionQuestion[] = [];
    for (const qRaw of c.questions) {
      if (!qRaw || typeof qRaw !== "object") return { error: `case ${caseId}: invalid question` };
      const q = qRaw as Record<string, unknown>;
      const name = typeof q.name === "string" ? q.name.trim() : "";
      if (!name) return { error: `case ${caseId}: question name required` };
      if (q.type === "choice") {
        if (!Array.isArray(q.options) || q.options.length === 0) {
          return { error: `case ${caseId}: choice options required` };
        }
        const options = q.options.map((o) => {
          if (!o || typeof o !== "object") return null;
          const opt = o as Record<string, unknown>;
          const id = typeof opt.id === "string" ? opt.id.trim() : "";
          if (!id) return null;
          return {
            id,
            description: typeof opt.description === "string" ? opt.description : undefined,
          };
        });
        if (options.some((o) => o === null)) {
          return { error: `case ${caseId}: choice option id required` };
        }
        questions.push({
          type: "choice",
          name,
          instructions: typeof q.instructions === "string" ? q.instructions : undefined,
          options: options as Array<{ id: string; description?: string }>,
        });
        continue;
      }
      if (q.type === "noul" || q.type === "predicate") {
        const statement =
          (typeof q.statement === "string" && q.statement.trim()) ||
          (typeof q.instructions === "string" && q.instructions.trim()) ||
          "";
        if (!statement) return { error: `case ${caseId}: noul/predicate needs statement` };
        questions.push({ type: "noul", name, statement });
        continue;
      }
      return { error: `case ${caseId}: unsupported question type '${String(q.type)}'` };
    }
    const expected: FanoutExpectedAnswer[] = [];
    for (const eRaw of c.expected) {
      if (!eRaw || typeof eRaw !== "object") return { error: `case ${caseId}: invalid expected` };
      const e = eRaw as Record<string, unknown>;
      const en = typeof e.name === "string" ? e.name.trim() : "";
      const ea = typeof e.answer === "string" ? e.answer.trim() : "";
      if (!en || !ea) return { error: `case ${caseId}: expected name+answer required` };
      expected.push({ name: en, answer: ea });
    }
    cases.push({
      caseId,
      state,
      questions,
      expected,
      useSiteId: typeof c.useSiteId === "string" ? c.useSiteId : undefined,
    });
  }

  const qb =
    b.qualityBar && typeof b.qualityBar === "object"
      ? (b.qualityBar as Record<string, unknown>)
      : {};
  return {
    mode: "bulk",
    cases,
    backends,
    useSiteId: typeof b.useSiteId === "string" ? b.useSiteId : undefined,
    qualityBar: {
      maxWrongAnswers: typeof qb.maxWrongAnswers === "number" ? qb.maxWrongAnswers : undefined,
      minAnswered: typeof qb.minAnswered === "number" ? qb.minAnswered : undefined,
    },
  };
}

export function runFanoutEvalBulk(opts: {
  request: FanoutEvalRequest;
  decide?: FanoutDecideFn;
  callRemote?: FanoutRemoteFn;
  env?: NodeJS.ProcessEnv;
}): Effect.Effect<FanoutEvalResponse> {
  return Effect.gen(function* () {
    const env = opts.env ?? process.env;
    const decide = opts.decide ?? runDecision;
    const remoteOverride = opts.callRemote;
    const callRemote =
      remoteOverride ??
      ((body: OpenAiDecisionCreateRequest) => callRemoteOpenAiDecisions(body, { env }));
    const lunaCallable = Boolean(remoteOverride) || remoteLunaAvailable(env);
    const maxWrong = opts.request.qualityBar?.maxWrongAnswers ?? 0;
    const minAnswered = opts.request.qualityBar?.minAnswered ?? 1;
    const traceId = randomUUID();

    type CaseAnswer = { caseId: string; backendId: string; value: string | null };
    const caseAnswers: CaseAnswer[] = [];
    const reports: FanoutBackendReport[] = [];

    for (const backend of opts.request.backends) {
      let answered = 0;
      let correct = 0;
      let wrong = 0;
      let abstained = 0;
      let skipped = 0;
      let skipReason: string | undefined;

      if (isLunaBackend(backend) && !lunaCallable) {
        skipped = opts.request.cases.length;
        skipReason = "OPENAI_API_KEY (or CLAWQL_DECISIONS_OPENAI_API_KEY) required for Luna";
        for (const c of opts.request.cases) {
          caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
        }
      } else {
        for (const c of opts.request.cases) {
          const useSiteId =
            c.useSiteId?.trim() || opts.request.useSiteId?.trim() || "search_provider_tool_routing";
          let value: string | null = null;
          if (isLunaBackend(backend)) {
            const remote = yield* Effect.tryPromise({
              try: () =>
                callRemote({
                  model: backend.model?.includes("luna")
                    ? "gpt-6-luna"
                    : backend.model || "gpt-6-luna",
                  input: c.state,
                  questions: questionsToOpenAi(c.questions),
                  use_site_id: useSiteId,
                  allow_uncalibrated: true,
                }),
              catch: (e) => (e instanceof Error ? e : new Error(String(e))),
            }).pipe(
              Effect.catch(() => Effect.succeed(null as OpenAiDecisionCreateResponse | null))
            );
            if (!remote) {
              skipped += 1;
              skipReason = skipReason ?? "remote Luna call failed";
              caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
              continue;
            }
            value = selectedFromOpenAi(remote, c.expected[0]!.name);
          } else {
            const result = yield* Effect.tryPromise({
              try: () =>
                decide({
                  state: c.state,
                  questions: c.questions,
                  useSiteId,
                  sessionId: `fanout:${traceId}:${c.caseId}`,
                }),
              catch: (e) => (e instanceof Error ? e : new Error(String(e))),
            }).pipe(Effect.catch(() => Effect.succeed(null as DecisionResponse | null)));
            if (!result) {
              skipped += 1;
              skipReason = skipReason ?? "local decide failed";
              caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
              continue;
            }
            value = selectedAnswer(result, c.expected[0]!.name);
          }

          caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value });
          if (value === null) {
            abstained += 1;
            continue;
          }
          answered += 1;
          // v0.1 scores the primary (first) expected answer per case.
          if (value === c.expected[0]!.answer) correct += 1;
          else wrong += 1;
        }
      }

      const meetsQualityBar = wrong <= maxWrong && answered >= minAnswered && skipped === 0;
      const answersOnItsOwn = meetsQualityBar ? correct : 0;
      const costEstimate =
        typeof backend.costPerCase === "number"
          ? backend.costPerCase * opts.request.cases.length
          : undefined;

      reports.push({
        backendId: backend.id,
        model: backend.model,
        answered,
        correct,
        wrong,
        abstained,
        skipped,
        answersOnItsOwn,
        meetsQualityBar,
        costEstimate,
        skipReason,
      });
    }

    const byCase = new Map<string, Record<string, string | null>>();
    for (const row of caseAnswers) {
      const bag = byCase.get(row.caseId) ?? {};
      bag[row.backendId] = row.value;
      byCase.set(row.caseId, bag);
    }
    const disagreements: FanoutDisagreement[] = [];
    for (const [caseId, answers] of byCase) {
      const values = Object.values(answers).filter((v) => v !== null);
      const unique = new Set(values);
      if (unique.size > 1) {
        disagreements.push({ caseId, answers });
      }
    }

    const eligible = reports.filter((r) => r.meetsQualityBar);
    let recommendation: FanoutEvalResponse["recommendation"];
    if (eligible.length) {
      const ranked = [...eligible].sort((a, b) => {
        const ca = a.costEstimate ?? Number.POSITIVE_INFINITY;
        const cb = b.costEstimate ?? Number.POSITIVE_INFINITY;
        if (ca !== cb) return ca - cb;
        return 0;
      });
      const winner = ranked[0]!;
      recommendation = {
        backendId: winner.backendId,
        reason:
          typeof winner.costEstimate === "number"
            ? `Lowest costEstimate (${winner.costEstimate}) among backends meeting maxWrong=${maxWrong}`
            : `First backend meeting maxWrong=${maxWrong} (no costPerCase provided)`,
      };
    }

    return {
      object: "clawql.decision.fanout_eval" as const,
      mode: "bulk" as const,
      reports,
      recommendation,
      disagreements,
      traceId,
      caseCount: opts.request.cases.length,
    };
  });
}

export class FanoutEvalService extends Context.Service<
  FanoutEvalService,
  {
    readonly evaluate: (req: FanoutEvalRequest) => Effect.Effect<FanoutEvalResponse>;
  }
>()("clawql/inference/FanoutEvalService") {}

export function makeFanoutEvalLive(
  opts: {
    decide?: FanoutDecideFn;
    callRemote?: FanoutRemoteFn;
    env?: NodeJS.ProcessEnv;
  } = {}
): Layer.Layer<FanoutEvalService> {
  return Layer.succeed(FanoutEvalService, {
    evaluate: (req) =>
      runFanoutEvalBulk({
        request: req,
        decide: opts.decide,
        callRemote: opts.callRemote,
        env: opts.env,
      }),
  });
}

export const FanoutEvalLive = makeFanoutEvalLive();

export function runFanoutEval(
  req: FanoutEvalRequest,
  opts: {
    decide?: FanoutDecideFn;
    callRemote?: FanoutRemoteFn;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<FanoutEvalResponse> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* FanoutEvalService;
      return yield* svc.evaluate(req);
    }).pipe(Effect.provide(makeFanoutEvalLive(opts)))
  );
}

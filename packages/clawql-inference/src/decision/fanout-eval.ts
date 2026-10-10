/**
 * Multi-backend decisions fan-out evaluation (v0.1).
 * - bulk: labeled cases → recommend cheapest backend meeting honesty bar
 * - disagreement_mining: unlabeled batch → emit cross-backend disagreements for Review
 * - ensemble: labeled majority quorum — recommend only when it raises answers-on-its-own
 * Optional flip-rate attach on mining disagreements (fan-out × flip coupling).
 */

import { randomUUID } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import type { DecisionQuestion, DecisionRequest, DecisionResponse } from "./service.js";
import { runDecision } from "./service.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";
import { callRemoteOpenAiDecisions, remoteLunaAvailable } from "./remote-decisions.js";
import {
  callRemoteOpenRouterDecisions,
  isOpenRouterDecisionBackendId,
  remoteOpenRouterDecisionsAvailable,
  resolveOpenRouterDecisionsModel,
} from "./remote-openrouter-decisions.js";
import { runFlipRateGate, type FlipRateFamily, type FlipRateDecideFn } from "./flip-rate.js";

export type FanoutEvalMode = "bulk" | "disagreement_mining" | "ensemble";

export const ENSEMBLE_BACKEND_ID = "ensemble";

export type FanoutExpectedAnswer = {
  readonly name: string;
  readonly answer: string;
};

export type FanoutEvalCase = {
  readonly caseId: string;
  readonly state: string;
  readonly questions: readonly DecisionQuestion[];
  /** Required for bulk; omit for disagreement_mining. */
  readonly expected?: readonly FanoutExpectedAnswer[];
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

/** When set on disagreement_mining, attach flip-rate pass/fail per disagreed case. */
export type FanoutFlipRateAttach = {
  readonly maxFlipRate?: number;
  readonly families?: readonly FlipRateFamily[];
};

export type FanoutEvalRequest = {
  readonly mode: FanoutEvalMode;
  readonly cases: readonly FanoutEvalCase[];
  readonly backends: readonly FanoutBackendSpec[];
  readonly useSiteId?: string;
  readonly qualityBar?: FanoutQualityBar;
  readonly flipRate?: FanoutFlipRateAttach;
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

export type FanoutDisagreementFlipRate = {
  readonly passed: boolean;
  readonly flipRate: number;
  readonly flips: number;
  readonly perturbations: number;
  readonly baseline: string | null;
};

export type FanoutDisagreement = {
  readonly caseId: string;
  readonly answers: Record<string, string | null>;
  readonly flipRate?: FanoutDisagreementFlipRate;
};

export type FanoutEnsembleSummary = {
  readonly backendId: typeof ENSEMBLE_BACKEND_ID;
  readonly answersOnItsOwn: number;
  readonly bestSingleAnswersOnItsOwn: number;
  /** True only when ensemble answersOnItsOwn strictly beats every single backend. */
  readonly raisesAnswersOnItsOwn: boolean;
  readonly quorum: "majority";
};

export type FanoutEvalResponse = {
  readonly object: "clawql.decision.fanout_eval";
  readonly mode: FanoutEvalMode;
  readonly reports: readonly FanoutBackendReport[];
  readonly recommendation?: {
    readonly backendId: string;
    readonly reason: string;
  };
  readonly disagreements: readonly FanoutDisagreement[];
  /** Alias count for Review queues — same length as `disagreements`. */
  readonly reviewCount: number;
  readonly ensemble?: FanoutEnsembleSummary;
  readonly traceId: string;
  readonly caseCount: number;
};

export type FanoutDecideFn = (req: DecisionRequest) => Promise<DecisionResponse>;
export type FanoutRemoteFn = (
  body: OpenAiDecisionCreateRequest
) => Promise<OpenAiDecisionCreateResponse>;

function isLunaBackend(spec: FanoutBackendSpec): boolean {
  if (isOpenRouterDecisionBackendId(spec.id, spec.model)) return false;
  const id = spec.id.trim().toLowerCase();
  const model = (spec.model ?? "").trim().toLowerCase();
  return (
    id.includes("luna") || id.includes("openai") || model.includes("luna") || model === "gpt-6-luna"
  );
}

function isOpenRouterBackend(spec: FanoutBackendSpec): boolean {
  return isOpenRouterDecisionBackendId(spec.id, spec.model);
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

function parseQuestions(
  caseId: string,
  rawQuestions: unknown
): DecisionQuestion[] | { error: string } {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return { error: `case ${caseId}: questions required` };
  }
  const questions: DecisionQuestion[] = [];
  for (const qRaw of rawQuestions) {
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
  return questions;
}

export function parseFanoutEvalBody(body: unknown): FanoutEvalRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  if (b.mode !== "bulk" && b.mode !== "disagreement_mining" && b.mode !== "ensemble") {
    return { error: "mode must be 'bulk', 'disagreement_mining', or 'ensemble'" };
  }
  const mode = b.mode as FanoutEvalMode;
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
      return { error: "each case requires caseId, state, questions" };
    const c = raw as Record<string, unknown>;
    const caseId = typeof c.caseId === "string" ? c.caseId.trim() : "";
    const state = typeof c.state === "string" ? c.state.trim() : "";
    if (!caseId || !state) return { error: "each case requires caseId and state" };
    const questionsOrErr = parseQuestions(caseId, c.questions);
    if ("error" in questionsOrErr) return questionsOrErr;
    const questions = questionsOrErr;

    let expected: FanoutExpectedAnswer[] | undefined;
    if (mode === "bulk" || mode === "ensemble") {
      if (!Array.isArray(c.expected) || c.expected.length === 0) {
        return {
          error: `case ${caseId}: expected answers required for ${mode} mode`,
        };
      }
      expected = [];
      for (const eRaw of c.expected) {
        if (!eRaw || typeof eRaw !== "object") return { error: `case ${caseId}: invalid expected` };
        const e = eRaw as Record<string, unknown>;
        const en = typeof e.name === "string" ? e.name.trim() : "";
        const ea = typeof e.answer === "string" ? e.answer.trim() : "";
        if (!en || !ea) return { error: `case ${caseId}: expected name+answer required` };
        expected.push({ name: en, answer: ea });
      }
    } else if (c.expected !== undefined && c.expected !== null) {
      // Mining is unlabeled — refuse accidental labels so Review stays honest.
      if (Array.isArray(c.expected) && c.expected.length > 0) {
        return {
          error: `case ${caseId}: disagreement_mining is unlabeled — omit expected (use bulk for labeled eval)`,
        };
      }
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

  let flipRate: FanoutFlipRateAttach | undefined;
  if (b.flipRate !== undefined && b.flipRate !== null) {
    if (mode !== "disagreement_mining") {
      return { error: "flipRate attach is only supported with mode=disagreement_mining" };
    }
    if (typeof b.flipRate !== "object")
      return { error: "flipRate must be an object when provided" };
    const fr = b.flipRate as Record<string, unknown>;
    let families: FlipRateFamily[] | undefined;
    if (fr.families !== undefined) {
      if (!Array.isArray(fr.families) || fr.families.length === 0) {
        return { error: "flipRate.families must be a non-empty array when provided" };
      }
      const allowed = new Set(["whitespace", "case", "punctuation", "synonym"]);
      families = [];
      for (const f of fr.families) {
        if (typeof f !== "string" || !allowed.has(f)) {
          return { error: `unsupported flipRate family '${String(f)}'` };
        }
        families.push(f as FlipRateFamily);
      }
    }
    flipRate = {
      maxFlipRate: typeof fr.maxFlipRate === "number" ? fr.maxFlipRate : undefined,
      families,
    };
  }

  return {
    mode,
    cases,
    backends,
    useSiteId: typeof b.useSiteId === "string" ? b.useSiteId : undefined,
    qualityBar:
      mode === "bulk" || mode === "ensemble"
        ? {
            maxWrongAnswers:
              typeof qb.maxWrongAnswers === "number" ? qb.maxWrongAnswers : undefined,
            minAnswered: typeof qb.minAnswered === "number" ? qb.minAnswered : undefined,
          }
        : undefined,
    flipRate,
  };
}

/** Unique plurality among answering backends; abstain on ties or <2 answers. */
export function majorityQuorumVote(
  answers: Readonly<Record<string, string | null>>
): Effect.Effect<string | null> {
  return Effect.sync(() => {
    const counts = new Map<string, number>();
    for (const v of Object.values(answers)) {
      if (v === null) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let answering = 0;
    let best: string | null = null;
    let bestN = 0;
    let tie = false;
    for (const [v, n] of counts) {
      answering += n;
      if (n > bestN) {
        best = v;
        bestN = n;
        tie = false;
      } else if (n === bestN) {
        tie = true;
      }
    }
    if (answering < 2 || tie || best === null) return null;
    return best;
  });
}

function primaryQuestionName(c: FanoutEvalCase): string {
  return c.expected?.[0]?.name ?? c.questions[0]!.name;
}

function collectDisagreements(
  caseAnswers: ReadonlyArray<{ caseId: string; backendId: string; value: string | null }>
): FanoutDisagreement[] {
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
  return disagreements;
}

function attachFlipRateToDisagreements(opts: {
  disagreements: readonly FanoutDisagreement[];
  cases: readonly FanoutEvalCase[];
  flipRate: FanoutFlipRateAttach;
  decide: FlipRateDecideFn;
  useSiteId?: string;
}): Effect.Effect<readonly FanoutDisagreement[]> {
  return Effect.gen(function* () {
    const byId = new Map(opts.cases.map((c) => [c.caseId, c]));
    const out: FanoutDisagreement[] = [];
    for (const d of opts.disagreements) {
      const c = byId.get(d.caseId);
      if (!c) {
        out.push(d);
        continue;
      }
      const report = yield* runFlipRateGate({
        request: {
          cases: [
            {
              caseId: c.caseId,
              state: c.state,
              questions: c.questions,
              useSiteId: c.useSiteId,
            },
          ],
          useSiteId: opts.useSiteId,
          maxFlipRate: opts.flipRate.maxFlipRate,
          families: opts.flipRate.families,
        },
        decide: opts.decide,
      });
      const caseReport = report.reports[0];
      out.push({
        ...d,
        flipRate: caseReport
          ? {
              passed: caseReport.passed,
              flipRate: caseReport.flipRate,
              flips: caseReport.flips,
              perturbations: caseReport.perturbations,
              baseline: caseReport.baseline,
            }
          : { passed: false, flipRate: 1, flips: 0, perturbations: 0, baseline: null },
      });
    }
    return out;
  });
}

export function runFanoutEvalBulk(opts: {
  request: FanoutEvalRequest;
  decide?: FanoutDecideFn;
  callRemote?: FanoutRemoteFn;
  callOpenRouter?: FanoutRemoteFn;
  env?: NodeJS.ProcessEnv;
}): Effect.Effect<FanoutEvalResponse> {
  return Effect.gen(function* () {
    if (opts.request.mode !== "bulk" && opts.request.mode !== "ensemble") {
      return yield* Effect.die(new Error("runFanoutEvalBulk requires mode=bulk|ensemble"));
    }
    const labeledMode = opts.request.mode;
    const env = opts.env ?? process.env;
    const decide = opts.decide ?? runDecision;
    const remoteOverride = opts.callRemote;
    const callRemote =
      remoteOverride ??
      ((body: OpenAiDecisionCreateRequest) => callRemoteOpenAiDecisions(body, { env }));
    const openRouterOverride = opts.callOpenRouter;
    const callOpenRouter =
      openRouterOverride ??
      ((body: OpenAiDecisionCreateRequest) => callRemoteOpenRouterDecisions(body, { env }));
    const lunaCallable = Boolean(remoteOverride) || remoteLunaAvailable(env);
    const openRouterCallable =
      Boolean(openRouterOverride) || remoteOpenRouterDecisionsAvailable(env);
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

      if (isOpenRouterBackend(backend) && !openRouterCallable) {
        skipped = opts.request.cases.length;
        skipReason =
          "OPENROUTER_API_KEY (or CLAWQL_DECISIONS_OPENROUTER_API_KEY) required for Decision-1";
        for (const c of opts.request.cases) {
          caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
        }
      } else if (isLunaBackend(backend) && !lunaCallable) {
        skipped = opts.request.cases.length;
        skipReason = "OPENAI_API_KEY (or CLAWQL_DECISIONS_OPENAI_API_KEY) required for Luna";
        for (const c of opts.request.cases) {
          caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
        }
      } else {
        for (const c of opts.request.cases) {
          const useSiteId =
            c.useSiteId?.trim() || opts.request.useSiteId?.trim() || "search_provider_tool_routing";
          const qName = primaryQuestionName(c);
          let value: string | null;
          if (isOpenRouterBackend(backend)) {
            const remote = yield* Effect.tryPromise({
              try: () =>
                callOpenRouter({
                  model: resolveOpenRouterDecisionsModel(backend.model || backend.id),
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
              skipReason = skipReason ?? "remote OpenRouter Decision-1 call failed";
              caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
              continue;
            }
            value = selectedFromOpenAi(remote, qName);
          } else if (isLunaBackend(backend)) {
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
            value = selectedFromOpenAi(remote, qName);
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
            value = selectedAnswer(result, qName);
          }

          caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value });
          if (value === null) {
            abstained += 1;
            continue;
          }
          answered += 1;
          const expectedAnswer = c.expected?.[0]?.answer;
          if (expectedAnswer !== undefined && value === expectedAnswer) correct += 1;
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

    const disagreements = collectDisagreements(caseAnswers);

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

    let ensemble: FanoutEnsembleSummary | undefined;
    let finalReports = reports;
    if (labeledMode === "ensemble") {
      const byCase = new Map<string, Record<string, string | null>>();
      for (const row of caseAnswers) {
        const bag = byCase.get(row.caseId) ?? {};
        bag[row.backendId] = row.value;
        byCase.set(row.caseId, bag);
      }
      let answered = 0;
      let correct = 0;
      let wrong = 0;
      let abstained = 0;
      for (const c of opts.request.cases) {
        const vote = yield* majorityQuorumVote(byCase.get(c.caseId) ?? {});
        if (vote === null) {
          abstained += 1;
          continue;
        }
        answered += 1;
        const expectedAnswer = c.expected?.[0]?.answer;
        if (expectedAnswer !== undefined && vote === expectedAnswer) correct += 1;
        else wrong += 1;
      }
      const meetsQualityBar = wrong <= maxWrong && answered >= minAnswered;
      const answersOnItsOwn = meetsQualityBar ? correct : 0;
      const costEstimate = reports.reduce((sum, r) => sum + (r.costEstimate ?? 0), 0);
      const ensembleReport: FanoutBackendReport = {
        backendId: ENSEMBLE_BACKEND_ID,
        model: "majority-quorum",
        answered,
        correct,
        wrong,
        abstained,
        skipped: 0,
        answersOnItsOwn,
        meetsQualityBar,
        costEstimate,
      };
      finalReports = [...reports, ensembleReport];
      const bestSingleAnswersOnItsOwn = reports.reduce((m, r) => Math.max(m, r.answersOnItsOwn), 0);
      const raisesAnswersOnItsOwn = answersOnItsOwn > bestSingleAnswersOnItsOwn;
      ensemble = {
        backendId: ENSEMBLE_BACKEND_ID,
        answersOnItsOwn,
        bestSingleAnswersOnItsOwn,
        raisesAnswersOnItsOwn,
        quorum: "majority",
      };
      // Fail-closed: never recommend ensemble unless it strictly raises honesty.
      if (raisesAnswersOnItsOwn && meetsQualityBar) {
        recommendation = {
          backendId: ENSEMBLE_BACKEND_ID,
          reason: `Majority quorum raises answersOnItsOwn (${answersOnItsOwn} > best single ${bestSingleAnswersOnItsOwn})`,
        };
      }
    }

    return {
      object: "clawql.decision.fanout_eval" as const,
      mode: labeledMode,
      reports: finalReports,
      recommendation,
      disagreements,
      reviewCount: disagreements.length,
      ensemble,
      traceId,
      caseCount: opts.request.cases.length,
    };
  });
}

export function runFanoutEvalDisagreementMining(opts: {
  request: FanoutEvalRequest;
  decide?: FanoutDecideFn;
  callRemote?: FanoutRemoteFn;
  callOpenRouter?: FanoutRemoteFn;
  env?: NodeJS.ProcessEnv;
}): Effect.Effect<FanoutEvalResponse> {
  return Effect.gen(function* () {
    if (opts.request.mode !== "disagreement_mining") {
      return yield* Effect.die(
        new Error("runFanoutEvalDisagreementMining requires mode=disagreement_mining")
      );
    }
    const env = opts.env ?? process.env;
    const decide = opts.decide ?? runDecision;
    const remoteOverride = opts.callRemote;
    const callRemote =
      remoteOverride ??
      ((body: OpenAiDecisionCreateRequest) => callRemoteOpenAiDecisions(body, { env }));
    const openRouterOverride = opts.callOpenRouter;
    const callOpenRouter =
      openRouterOverride ??
      ((body: OpenAiDecisionCreateRequest) => callRemoteOpenRouterDecisions(body, { env }));
    const lunaCallable = Boolean(remoteOverride) || remoteLunaAvailable(env);
    const openRouterCallable =
      Boolean(openRouterOverride) || remoteOpenRouterDecisionsAvailable(env);
    const traceId = randomUUID();

    type CaseAnswer = { caseId: string; backendId: string; value: string | null };
    const caseAnswers: CaseAnswer[] = [];
    const reports: FanoutBackendReport[] = [];

    for (const backend of opts.request.backends) {
      let answered = 0;
      let abstained = 0;
      let skipped = 0;
      let skipReason: string | undefined;

      if (isOpenRouterBackend(backend) && !openRouterCallable) {
        skipped = opts.request.cases.length;
        skipReason =
          "OPENROUTER_API_KEY (or CLAWQL_DECISIONS_OPENROUTER_API_KEY) required for Decision-1";
        for (const c of opts.request.cases) {
          caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
        }
      } else if (isLunaBackend(backend) && !lunaCallable) {
        skipped = opts.request.cases.length;
        skipReason = "OPENAI_API_KEY (or CLAWQL_DECISIONS_OPENAI_API_KEY) required for Luna";
        for (const c of opts.request.cases) {
          caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
        }
      } else {
        for (const c of opts.request.cases) {
          const useSiteId =
            c.useSiteId?.trim() || opts.request.useSiteId?.trim() || "search_provider_tool_routing";
          const qName = primaryQuestionName(c);
          let value: string | null;
          if (isOpenRouterBackend(backend)) {
            const remote = yield* Effect.tryPromise({
              try: () =>
                callOpenRouter({
                  model: resolveOpenRouterDecisionsModel(backend.model || backend.id),
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
              skipReason = skipReason ?? "remote OpenRouter Decision-1 call failed";
              caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
              continue;
            }
            value = selectedFromOpenAi(remote, qName);
          } else if (isLunaBackend(backend)) {
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
            value = selectedFromOpenAi(remote, qName);
          } else {
            const result = yield* Effect.tryPromise({
              try: () =>
                decide({
                  state: c.state,
                  questions: c.questions,
                  useSiteId,
                  sessionId: `fanout-mine:${traceId}:${c.caseId}`,
                }),
              catch: (e) => (e instanceof Error ? e : new Error(String(e))),
            }).pipe(Effect.catch(() => Effect.succeed(null as DecisionResponse | null)));
            if (!result) {
              skipped += 1;
              skipReason = skipReason ?? "local decide failed";
              caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value: null });
              continue;
            }
            value = selectedAnswer(result, qName);
          }

          caseAnswers.push({ caseId: c.caseId, backendId: backend.id, value });
          if (value === null) abstained += 1;
          else answered += 1;
        }
      }

      const costEstimate =
        typeof backend.costPerCase === "number"
          ? backend.costPerCase * opts.request.cases.length
          : undefined;

      reports.push({
        backendId: backend.id,
        model: backend.model,
        answered,
        correct: 0,
        wrong: 0,
        abstained,
        skipped,
        answersOnItsOwn: 0,
        meetsQualityBar: false,
        costEstimate,
        skipReason,
      });
    }

    let disagreements = collectDisagreements(caseAnswers);
    if (opts.request.flipRate) {
      disagreements = [
        ...(yield* attachFlipRateToDisagreements({
          disagreements,
          cases: opts.request.cases,
          flipRate: opts.request.flipRate,
          decide,
          useSiteId: opts.request.useSiteId,
        })),
      ];
    }

    return {
      object: "clawql.decision.fanout_eval" as const,
      mode: "disagreement_mining" as const,
      reports,
      disagreements,
      reviewCount: disagreements.length,
      traceId,
      caseCount: opts.request.cases.length,
    };
  });
}

export function runFanoutEvalEffect(opts: {
  request: FanoutEvalRequest;
  decide?: FanoutDecideFn;
  callRemote?: FanoutRemoteFn;
  callOpenRouter?: FanoutRemoteFn;
  env?: NodeJS.ProcessEnv;
}): Effect.Effect<FanoutEvalResponse> {
  return opts.request.mode === "disagreement_mining"
    ? runFanoutEvalDisagreementMining(opts)
    : runFanoutEvalBulk(opts); // bulk + ensemble
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
    callOpenRouter?: FanoutRemoteFn;
    env?: NodeJS.ProcessEnv;
  } = {}
): Layer.Layer<FanoutEvalService> {
  return Layer.succeed(FanoutEvalService, {
    evaluate: (req) =>
      runFanoutEvalEffect({
        request: req,
        decide: opts.decide,
        callRemote: opts.callRemote,
        callOpenRouter: opts.callOpenRouter,
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
    callOpenRouter?: FanoutRemoteFn;
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

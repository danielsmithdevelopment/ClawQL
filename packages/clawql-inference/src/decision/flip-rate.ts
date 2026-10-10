/**
 * Flip-rate / perturbation robustness gate for decision sites (v0.1).
 * Deterministic transforms; fail-closed suite pass when any case flips too often.
 */

import { randomUUID } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import type { DecisionQuestion, DecisionRequest, DecisionResponse } from "./service.js";
import { runDecision } from "./service.js";

export type FlipRateFamily = "whitespace" | "case" | "punctuation" | "synonym";

export const DEFAULT_FLIP_RATE_FAMILIES: readonly FlipRateFamily[] = [
  "whitespace",
  "case",
  "punctuation",
  "synonym",
];

export type FlipRateCase = {
  readonly caseId: string;
  readonly state: string;
  readonly questions: readonly DecisionQuestion[];
  readonly useSiteId?: string;
};

export type FlipRateRequest = {
  readonly cases: readonly FlipRateCase[];
  readonly useSiteId?: string;
  /** Default 0.1 — at most 10% of comparable perturbations may flip. */
  readonly maxFlipRate?: number;
  readonly families?: readonly FlipRateFamily[];
};

export type FlipRatePerturbationResult = {
  readonly family: FlipRateFamily;
  readonly label: string;
  readonly state: string;
  readonly answer: string | null;
  readonly flipped: boolean;
};

export type FlipRateCaseReport = {
  readonly caseId: string;
  readonly baseline: string | null;
  readonly perturbations: number;
  readonly flips: number;
  readonly flipRate: number;
  readonly passed: boolean;
  readonly details: readonly FlipRatePerturbationResult[];
};

export type FlipRateResponse = {
  readonly object: "clawql.decision.flip_rate";
  readonly maxFlipRate: number;
  readonly families: readonly FlipRateFamily[];
  readonly caseCount: number;
  readonly passed: boolean;
  readonly reports: readonly FlipRateCaseReport[];
  readonly traceId: string;
};

export type FlipRateDecideFn = (req: DecisionRequest) => Promise<DecisionResponse>;

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

export function applyPerturbations(
  state: string,
  families: readonly FlipRateFamily[]
): Array<{ family: FlipRateFamily; label: string; state: string }> {
  const out: Array<{ family: FlipRateFamily; label: string; state: string }> = [];
  const base = state;

  if (families.includes("whitespace")) {
    out.push({ family: "whitespace", label: "collapse", state: base.replace(/\s+/g, " ").trim() });
    out.push({ family: "whitespace", label: "pad", state: `  ${base.trim()}  ` });
  }
  if (families.includes("case")) {
    out.push({ family: "case", label: "lower", state: base.toLowerCase() });
    out.push({ family: "case", label: "upper", state: base.toUpperCase() });
    const titled = base.replace(/^\s*\w/, (ch) => ch.toUpperCase());
    out.push({ family: "case", label: "title_first", state: titled });
  }
  if (families.includes("punctuation")) {
    out.push({
      family: "punctuation",
      label: "strip_trail",
      state: base.replace(/[!?.]+$/g, "").trim(),
    });
    const stripped = base.replace(/[!?.]+$/g, "").trim();
    out.push({ family: "punctuation", label: "add_q", state: `${stripped}?` });
  }
  if (families.includes("synonym")) {
    for (let i = 0; i < SYNONYM_SWAPS.length; i++) {
      const [re, replacement] = SYNONYM_SWAPS[i]!;
      if (!re.test(base)) continue;
      // Reset lastIndex after test() on global regex
      re.lastIndex = 0;
      const next = base.replace(re, replacement);
      if (next !== base) {
        out.push({ family: "synonym", label: `swap_${i}`, state: next });
      }
      re.lastIndex = 0;
    }
  }

  // Drop no-ops identical to baseline (except pad, which differs by whitespace)
  return out.filter((p) => p.state !== base || p.label === "pad");
}

export function parseFlipRateBody(body: unknown): FlipRateRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.cases) || b.cases.length === 0) {
    return { error: "cases must be a non-empty array" };
  }

  const familiesRaw = b.families;
  let families: FlipRateFamily[] | undefined;
  if (familiesRaw !== undefined) {
    if (!Array.isArray(familiesRaw) || familiesRaw.length === 0) {
      return { error: "families must be a non-empty array when provided" };
    }
    const allowed = new Set(DEFAULT_FLIP_RATE_FAMILIES);
    families = [];
    for (const f of familiesRaw) {
      if (typeof f !== "string" || !allowed.has(f as FlipRateFamily)) {
        return {
          error: `unsupported family '${String(f)}'; use whitespace|case|punctuation|synonym`,
        };
      }
      families.push(f as FlipRateFamily);
    }
  }

  const cases: FlipRateCase[] = [];
  for (const raw of b.cases) {
    if (!raw || typeof raw !== "object") return { error: "each case requires caseId, state, questions" };
    const c = raw as Record<string, unknown>;
    const caseId = typeof c.caseId === "string" ? c.caseId.trim() : "";
    const state = typeof c.state === "string" ? c.state.trim() : "";
    if (!caseId || !state) return { error: "each case requires caseId and state" };
    if (!Array.isArray(c.questions) || c.questions.length === 0) {
      return { error: `case ${caseId}: questions required` };
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
    cases.push({
      caseId,
      state,
      questions,
      useSiteId: typeof c.useSiteId === "string" ? c.useSiteId : undefined,
    });
  }

  return {
    cases,
    useSiteId: typeof b.useSiteId === "string" ? b.useSiteId : undefined,
    maxFlipRate: typeof b.maxFlipRate === "number" ? b.maxFlipRate : undefined,
    families,
  };
}

export function runFlipRateGate(opts: {
  request: FlipRateRequest;
  decide?: FlipRateDecideFn;
}): Effect.Effect<FlipRateResponse> {
  return Effect.gen(function* () {
    const decide = opts.decide ?? runDecision;
    const maxFlipRate = opts.request.maxFlipRate ?? 0.1;
    const families = opts.request.families ?? DEFAULT_FLIP_RATE_FAMILIES;
    const traceId = randomUUID();
    const reports: FlipRateCaseReport[] = [];

    for (const c of opts.request.cases) {
      const useSiteId =
        c.useSiteId?.trim() || opts.request.useSiteId?.trim() || "search_provider_tool_routing";
      const questionName = c.questions[0]!.name;

      const baselineResult = yield* Effect.tryPromise({
        try: () =>
          decide({
            state: c.state,
            questions: c.questions,
            useSiteId,
            sessionId: `flip-rate:${traceId}:${c.caseId}:baseline`,
          }),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.catch(() => Effect.succeed(null as DecisionResponse | null)));

      const baseline = baselineResult
        ? selectedAnswer(baselineResult, questionName)
        : null;

      const perturbations = applyPerturbations(c.state, families);
      const details: FlipRatePerturbationResult[] = [];
      let comparable = 0;
      let flips = 0;

      for (const p of perturbations) {
        const result = yield* Effect.tryPromise({
          try: () =>
            decide({
              state: p.state,
              questions: c.questions,
              useSiteId,
              sessionId: `flip-rate:${traceId}:${c.caseId}:${p.family}:${p.label}`,
            }),
          catch: (e) => (e instanceof Error ? e : new Error(String(e))),
        }).pipe(Effect.catch(() => Effect.succeed(null as DecisionResponse | null)));

        const answer = result ? selectedAnswer(result, questionName) : null;
        // Only count when both baseline and perturbation answered — abstain↔answer is not a flip.
        if (baseline === null || answer === null) {
          details.push({
            family: p.family,
            label: p.label,
            state: p.state,
            answer,
            flipped: false,
          });
          continue;
        }
        comparable += 1;
        const flipped = answer !== baseline;
        if (flipped) flips += 1;
        details.push({
          family: p.family,
          label: p.label,
          state: p.state,
          answer,
          flipped,
        });
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
        details,
      });
    }

    return {
      object: "clawql.decision.flip_rate" as const,
      maxFlipRate,
      families: [...families],
      caseCount: opts.request.cases.length,
      passed: reports.every((r) => r.passed),
      reports,
      traceId,
    };
  });
}

export class FlipRateGateService extends Context.Service<
  FlipRateGateService,
  {
    readonly evaluate: (req: FlipRateRequest) => Effect.Effect<FlipRateResponse>;
  }
>()("clawql/inference/FlipRateGateService") {}

export function makeFlipRateGateLive(opts: {
  decide?: FlipRateDecideFn;
} = {}): Layer.Layer<FlipRateGateService> {
  return Layer.succeed(FlipRateGateService, {
    evaluate: (req) => runFlipRateGate({ request: req, decide: opts.decide }),
  });
}

export const FlipRateGateLive = makeFlipRateGateLive();

export function runFlipRate(
  req: FlipRateRequest,
  opts: { decide?: FlipRateDecideFn } = {}
): Promise<FlipRateResponse> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* FlipRateGateService;
      return yield* svc.evaluate(req);
    }).pipe(Effect.provide(makeFlipRateGateLive(opts)))
  );
}

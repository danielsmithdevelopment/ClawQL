/**
 * §7.2 frontier adjudication — label held-out cases via a judge port.
 *
 * Dry-run / recorded fixtures keep CI honest without calling a frontier API.
 * productionTrusted requires `adjudicationKind: "live"` on every case AND live
 * `gliner2` scorer backend (dry-run labels / stub / prior / heuristic never light
 * the gate).
 */

import { readFileSync } from "node:fs";
import { Context, Effect, Layer } from "effect";
import type { HeldOutCaseSpec, HeldOutSuiteManifest } from "./types.js";

export type AdjudicationLabel = {
  readonly caseId: string;
  readonly groundTruthCandidateId: string;
  readonly adjudicated: true;
  readonly judgeModel: string;
  readonly judgedAt: string;
  readonly rationale: string;
};

export type AdjudicationRunReport = {
  readonly suiteId: string;
  readonly judgeModel: string;
  readonly mode: "dry-run" | "live";
  readonly labels: readonly AdjudicationLabel[];
  readonly cases: readonly HeldOutCaseSpec[];
};

export class FrontierAdjudicator extends Context.Tag("clawql/FrontierAdjudicator")<
  FrontierAdjudicator,
  {
    readonly adjudicateCase: (c: HeldOutCaseSpec) => Effect.Effect<AdjudicationLabel, Error>;
    readonly judgeModelId: () => string;
  }
>() {}

/**
 * Dry-run adjudicator: copies the suite's provisional groundTruthCandidateId
 * and marks adjudicated:true with provenance `dry-run:<model>`.
 * Never claim this satisfies productionTrusted without a real frontier judge.
 */
export function makeDryRunFrontierAdjudicator(
  judgeModel = "dry-run-recorded"
): Context.Tag.Service<typeof FrontierAdjudicator> {
  return {
    judgeModelId: () => judgeModel,
    adjudicateCase: (c) =>
      Effect.succeed({
        caseId: c.caseId,
        groundTruthCandidateId: c.groundTruthCandidateId,
        adjudicated: true as const,
        judgeModel,
        judgedAt: new Date().toISOString(),
        rationale: "dry-run: echoed fixture groundTruthCandidateId — not a frontier judge verdict",
      }),
  };
}

export const DryRunFrontierAdjudicatorLive: Layer.Layer<FrontierAdjudicator> = Layer.succeed(
  FrontierAdjudicator,
  makeDryRunFrontierAdjudicator()
);

/**
 * Live adjudicator stub — calls CLAWQL_FAST_DECISION_JUDGE_URL when set.
 * Body: { caseId, query, candidates, useSiteId }. Expects JSON
 * { groundTruthCandidateId, rationale }.
 */
export function makeHttpFrontierAdjudicator(args: {
  readonly url: string;
  readonly model: string;
  readonly token?: string;
  readonly fetchImpl?: typeof fetch;
}): Context.Tag.Service<typeof FrontierAdjudicator> {
  const fetchImpl = args.fetchImpl ?? fetch;
  return {
    judgeModelId: () => args.model,
    adjudicateCase: (c) =>
      Effect.tryPromise({
        try: async () => {
          const res = await fetchImpl(args.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(args.token ? { authorization: `Bearer ${args.token}` } : {}),
            },
            body: JSON.stringify({
              caseId: c.caseId,
              useSiteId: c.useSiteId,
              query: c.query,
              candidates: c.candidates,
              model: args.model,
            }),
          });
          if (!res.ok) {
            const detail = (await res.text()).slice(0, 500);
            throw new Error(
              `judge HTTP ${res.status}${detail ? `: ${detail}` : ""} (caseId=${c.caseId})`
            );
          }
          const body = (await res.json()) as {
            groundTruthCandidateId?: string;
            rationale?: string;
          };
          if (!body.groundTruthCandidateId) {
            throw new Error("judge response missing groundTruthCandidateId");
          }
          return {
            caseId: c.caseId,
            groundTruthCandidateId: body.groundTruthCandidateId,
            adjudicated: true as const,
            judgeModel: args.model,
            judgedAt: new Date().toISOString(),
            rationale: body.rationale ?? "",
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }),
  };
}

export function adjudicationKindForLabel(label: AdjudicationLabel): "dry-run" | "live" {
  return label.judgeModel.startsWith("dry-run") ? "dry-run" : "live";
}

export function applyAdjudicationLabels(
  suite: HeldOutSuiteManifest,
  labels: readonly AdjudicationLabel[]
): HeldOutSuiteManifest {
  const byId = new Map(labels.map((l) => [l.caseId, l]));
  return {
    ...suite,
    cases: suite.cases.map((c) => {
      const label = byId.get(c.caseId);
      if (!label) return c;
      return {
        ...c,
        groundTruthCandidateId: label.groundTruthCandidateId,
        adjudicated: true,
        adjudicationKind: adjudicationKindForLabel(label),
        notes: [c.notes, `adjudicated by ${label.judgeModel}: ${label.rationale}`]
          .filter(Boolean)
          .join(" | "),
      };
    }),
  };
}

/**
 * Parse frontier labels JSON (GHA artifact / runner `--out` shape).
 * Fail-closed: refuses dry-run judgeModel provenance and empty/malformed payloads.
 */
export function parseLiveAdjudicationLabels(raw: unknown): readonly AdjudicationLabel[] {
  const obj = raw as { labels?: unknown } | unknown[];
  const list = Array.isArray(obj) ? obj : (obj as { labels?: unknown }).labels;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("adjudication labels JSON must contain a non-empty labels array");
  }
  const out: AdjudicationLabel[] = [];
  for (const item of list) {
    const l = item as Partial<AdjudicationLabel>;
    if (!l || typeof l.caseId !== "string" || !l.caseId.trim()) {
      throw new Error("label missing caseId");
    }
    if (typeof l.groundTruthCandidateId !== "string" || !l.groundTruthCandidateId.trim()) {
      throw new Error(`label ${l.caseId}: missing groundTruthCandidateId`);
    }
    if (typeof l.judgeModel !== "string" || !l.judgeModel.trim()) {
      throw new Error(`label ${l.caseId}: missing judgeModel`);
    }
    if (l.judgeModel.startsWith("dry-run")) {
      throw new Error(
        `label ${l.caseId}: refusing dry-run judgeModel "${l.judgeModel}" (use live frontier labels only)`
      );
    }
    out.push({
      caseId: l.caseId,
      groundTruthCandidateId: l.groundTruthCandidateId,
      adjudicated: true,
      judgeModel: l.judgeModel,
      judgedAt:
        typeof l.judgedAt === "string" && l.judgedAt ? l.judgedAt : new Date().toISOString(),
      rationale: typeof l.rationale === "string" ? l.rationale : "",
    });
  }
  return out;
}

/** Load + parse live labels from a JSON file path (Effect.sync for Effect hosts). */
export function loadLiveAdjudicationLabelsFromJsonFile(
  path: string
): Effect.Effect<readonly AdjudicationLabel[], Error> {
  return Effect.try({
    try: () => parseLiveAdjudicationLabels(JSON.parse(readFileSync(path, "utf8"))),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });
}

export function adjudicateHeldOutSuite(
  suite: HeldOutSuiteManifest
): Effect.Effect<AdjudicationRunReport, Error, FrontierAdjudicator> {
  return Effect.gen(function* () {
    const judge = yield* FrontierAdjudicator;
    const labels: AdjudicationLabel[] = [];
    for (const c of suite.cases) {
      labels.push(yield* judge.adjudicateCase(c));
    }
    const mode = judge.judgeModelId().startsWith("dry-run") ? "dry-run" : "live";
    const cases = applyAdjudicationLabels(suite, labels).cases;
    return {
      suiteId: suite.suiteId,
      judgeModel: judge.judgeModelId(),
      mode,
      labels,
      cases,
    };
  });
}

/** Env-selected Layer: HTTP judge when URL set, else dry-run. */
export function frontierAdjudicatorLayerFromEnv(): Layer.Layer<FrontierAdjudicator> {
  const url = process.env.CLAWQL_FAST_DECISION_JUDGE_URL?.trim();
  if (!url) return DryRunFrontierAdjudicatorLive;
  const model = process.env.CLAWQL_FAST_DECISION_JUDGE_MODEL?.trim() || "frontier-judge";
  const token = process.env.CLAWQL_FAST_DECISION_JUDGE_TOKEN?.trim();
  return Layer.succeed(FrontierAdjudicator, makeHttpFrontierAdjudicator({ url, model, token }));
}

/**
 * Fail-closed policies for OpenAI-compatible /v1/decisions.
 * SDKs ignore unknown fields like `calibrated`, so unproven answers must surface
 * as `refusal` unless the caller explicitly opts in.
 */

import { Context, Effect, Layer } from "effect";
import type { VirtualKeyRequest } from "../api/auth.js";
import type { DecisionAnswer, DecisionQuestion } from "./service.js";
import { isLunaModelId, isMicrosoftDecision1ModelId } from "./openai-adapt.js";

/** Local Fast Decision / auto-escalation models. */
export const LOCAL_DECISION_MODELS = new Set([
  "clawql",
  "clawql-auto",
  "gliner2",
  "gliner",
  "heuristic",
]);

export type DecisionsModelKind = "local" | "luna" | "microsoft" | "unknown";

export type RefusalAnswer = { readonly name: string; readonly refusal: string };

function headerTruthy(
  headers: VirtualKeyRequest["headers"],
  name: string
): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const raw = headers[name];
    const headerVal = Array.isArray(raw) ? raw[0] : raw;
    return typeof headerVal === "string" && /^(1|true|yes)$/i.test(headerVal.trim());
  });
}

function clawqlBodyFlag(
  body: Record<string, unknown>,
  flag: "allow_uncalibrated" | "allow_external_images"
): Effect.Effect<boolean> {
  return Effect.sync(() => {
    if (body[flag] === true) return true;
    const clawql = body.clawql;
    if (clawql && typeof clawql === "object" && !Array.isArray(clawql)) {
      return (clawql as Record<string, unknown>)[flag] === true;
    }
    return false;
  });
}

export function classifyDecisionsModel(model: string): Effect.Effect<DecisionsModelKind> {
  return Effect.sync(() => {
    const m = model.trim().toLowerCase();
    if (!m) return "unknown";
    if (LOCAL_DECISION_MODELS.has(m)) return "local";
    if (isLunaModelId(m)) return "luna";
    if (isMicrosoftDecision1ModelId(m)) return "microsoft";
    return "unknown";
  });
}

export function allowUncalibratedAnswers(opts: {
  req: VirtualKeyRequest;
  body: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
}): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const env = opts.env ?? process.env;
    if (env.CLAWQL_DECISIONS_ALLOW_UNCALIBRATED === "1") return true;
    if (yield* headerTruthy(opts.req.headers, "x-clawql-allow-uncalibrated")) return true;
    if (yield* clawqlBodyFlag(opts.body, "allow_uncalibrated")) return true;

    const sites = env.CLAWQL_DECISIONS_UNCALIBRATED_SITES?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (sites?.length) {
      const useSite =
        (typeof opts.body.use_site_id === "string" && opts.body.use_site_id.trim()) ||
        (typeof opts.body.useSiteId === "string" && opts.body.useSiteId.trim()) ||
        "";
      if (useSite && sites.includes(useSite)) return true;
    }
    return false;
  });
}

/**
 * Images may leave the trust boundary only with explicit policy —
 * having OPENAI_API_KEY is not consent.
 */
export function allowExternalImageEgress(opts: {
  req: VirtualKeyRequest;
  body: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  useSiteId?: string;
}): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    const env = opts.env ?? process.env;
    if (env.CLAWQL_DECISIONS_ALLOW_EXTERNAL_IMAGES === "1") {
      const sites = env.CLAWQL_DECISIONS_EXTERNAL_IMAGE_SITES?.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (sites?.length) {
        const site = opts.useSiteId?.trim() || "";
        return Boolean(site && sites.includes(site));
      }
      return true;
    }

    if (yield* headerTruthy(opts.req.headers, "x-clawql-allow-external-images")) return true;
    if (yield* clawqlBodyFlag(opts.body, "allow_external_images")) return true;

    const vk = opts.req.virtualKey as { allowExternalDecisionImages?: boolean } | undefined;
    if (vk?.allowExternalDecisionImages === true) return true;

    return false;
  });
}

export function refusalForUncalibrated(
  questionName: string,
  reason: string
): Effect.Effect<RefusalAnswer> {
  return Effect.sync(() => ({
    name: questionName,
    refusal: reason,
  }));
}

/**
 * Decide which OpenAI answers must become refusals under fail-closed rules.
 * Score is never calibrated until ordinal calibration ships.
 */
export function refusalsForFailClosed(opts: {
  questions: readonly DecisionQuestion[];
  answers: readonly DecisionAnswer[];
  allowUncalibrated: boolean;
}): Effect.Effect<readonly RefusalAnswer[]> {
  return Effect.gen(function* () {
    if (opts.allowUncalibrated) return [];
    const out: RefusalAnswer[] = [];
    for (let i = 0; i < opts.questions.length; i++) {
      const q = opts.questions[i]!;
      const a = opts.answers[i];
      if (!a) {
        out.push(
          yield* refusalForUncalibrated(
            q.name,
            "No answer produced; site is not calibrated for this request"
          )
        );
        continue;
      }
      if (q.type === "score" || a.type === "score") {
        out.push(
          yield* refusalForUncalibrated(
            q.name,
            "Score answers are not calibrated yet; opt in with x-clawql-allow-uncalibrated: 1 to receive uncalibrated scores"
          )
        );
        continue;
      }
      if (!a.calibrated) {
        out.push(
          yield* refusalForUncalibrated(
            q.name,
            "Decision site is not calibrated for this backend; opt in with x-clawql-allow-uncalibrated: 1 to receive uncalibrated answers"
          )
        );
      }
    }
    return out;
  });
}

/** Luna remote answers are never site-calibrated — refuse unless opted in. */
export function refusalsForUncalibratedRemote(opts: {
  questionNames: readonly string[];
  allowUncalibrated: boolean;
  backendLabel: string;
}): Effect.Effect<readonly RefusalAnswer[]> {
  return Effect.gen(function* () {
    if (opts.allowUncalibrated) return [];
    const out: RefusalAnswer[] = [];
    for (const name of opts.questionNames) {
      out.push(
        yield* refusalForUncalibrated(
          name,
          `${opts.backendLabel} probabilities are not site-calibrated; opt in with x-clawql-allow-uncalibrated: 1 to receive them`
        )
      );
    }
    return out;
  });
}

export function supportedModelsMessage(): Effect.Effect<string> {
  return Effect.succeed(
    "Supported models: clawql-auto (local-first + escalate), clawql, gliner2, gliner, heuristic, gpt-6-luna"
  );
}

export function modelRejectionMessage(model: string, kind: DecisionsModelKind): Effect.Effect<string> {
  return Effect.gen(function* () {
    const supported = yield* supportedModelsMessage();
    if (kind === "microsoft") {
      return `model '${model}' (Microsoft-Decision-1) is not available on this gateway yet. ${supported}`;
    }
    return `Invalid model: '${model}'. ${supported}`;
  });
}

export class DecisionsPolicyService extends Context.Service<
  DecisionsPolicyService,
  {
    readonly classifyModel: (model: string) => Effect.Effect<DecisionsModelKind>;
    readonly allowUncalibrated: (opts: {
      req: VirtualKeyRequest;
      body: Record<string, unknown>;
      env?: NodeJS.ProcessEnv;
    }) => Effect.Effect<boolean>;
    readonly allowExternalImages: (opts: {
      req: VirtualKeyRequest;
      body: Record<string, unknown>;
      env?: NodeJS.ProcessEnv;
      useSiteId?: string;
    }) => Effect.Effect<boolean>;
    readonly refusalsForFailClosed: (opts: {
      questions: readonly DecisionQuestion[];
      answers: readonly DecisionAnswer[];
      allowUncalibrated: boolean;
    }) => Effect.Effect<readonly RefusalAnswer[]>;
    readonly refusalsForUncalibratedRemote: (opts: {
      questionNames: readonly string[];
      allowUncalibrated: boolean;
      backendLabel: string;
    }) => Effect.Effect<readonly RefusalAnswer[]>;
    readonly modelRejectionMessage: (
      model: string,
      kind: DecisionsModelKind
    ) => Effect.Effect<string>;
  }
>()("clawql/inference/DecisionsPolicyService") {}

export const DecisionsPolicyLive = Layer.succeed(DecisionsPolicyService, {
  classifyModel: classifyDecisionsModel,
  allowUncalibrated: allowUncalibratedAnswers,
  allowExternalImages: allowExternalImageEgress,
  refusalsForFailClosed,
  refusalsForUncalibratedRemote,
  modelRejectionMessage,
});

/** Thin host boundary for Express handlers. */
export function runDecisionsPolicySync<A>(effect: Effect.Effect<A>): A {
  return Effect.runSync(effect.pipe(Effect.provide(DecisionsPolicyLive)));
}

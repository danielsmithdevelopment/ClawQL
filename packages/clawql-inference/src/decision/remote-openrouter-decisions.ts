/**
 * OpenRouter Decisions / System One client for Microsoft-Decision-1 (and peers).
 * Wire: POST {base}/decisions with map-shaped questions → OpenAI Decisions response.
 */

import { Context, Effect, Layer } from "effect";
import type {
  OpenAiDecisionCreateRequest,
  OpenAiDecisionCreateResponse,
  OpenAiDecisionQuestion,
  OpenAiDecisionAnswer,
} from "./openai-types.js";
import { isMicrosoftDecision1ModelId } from "./openai-adapt.js";

export const DEFAULT_OPENROUTER_DECISIONS_MODEL = "microsoft/microsoft-decision-1";
export const DEFAULT_OPENROUTER_DECISIONS_BASE = "https://openrouter.ai/api/alpha";

export type CallOpenRouterDecisionsOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
  readonly httpReferer?: string;
  readonly appTitle?: string;
};

/** Env opt-in read — Effect-primary via OpenRouterDecisionsConfigService. */
export function readOpenRouterDecisionsConfigFromEnv(env: NodeJS.ProcessEnv = process.env): {
  apiKey?: string;
  baseUrl: string;
  httpReferer?: string;
  appTitle?: string;
} {
  const apiKey = env.CLAWQL_DECISIONS_OPENROUTER_API_KEY?.trim() || env.OPENROUTER_API_KEY?.trim();
  const baseUrl = (
    env.CLAWQL_DECISIONS_OPENROUTER_BASE_URL?.trim() ||
    env.OPENROUTER_BASE_URL?.trim() ||
    DEFAULT_OPENROUTER_DECISIONS_BASE
  ).replace(/\/$/, "");
  return {
    apiKey: apiKey || undefined,
    baseUrl,
    httpReferer: env.CLAWQL_OPENROUTER_HTTP_REFERER?.trim() || undefined,
    appTitle: env.CLAWQL_OPENROUTER_APP_TITLE?.trim() || undefined,
  };
}

export function remoteOpenRouterDecisionsAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(readOpenRouterDecisionsConfigFromEnv(env).apiKey);
}

export function resolveOpenRouterDecisionsModel(model?: string): string {
  const m = (model ?? "").trim();
  if (!m) return DEFAULT_OPENROUTER_DECISIONS_MODEL;
  if (isMicrosoftDecision1ModelId(m)) {
    if (m.includes("/")) return m.startsWith("microsoft/") ? m : `microsoft/${m}`;
    return DEFAULT_OPENROUTER_DECISIONS_MODEL;
  }
  // Allow openrouter/microsoft/... pins from fan-out specs.
  if (m.startsWith("openrouter/")) return m.slice("openrouter/".length);
  return m;
}

export function isOpenRouterDecisionBackendId(id: string, model?: string): boolean {
  const i = id.trim().toLowerCase();
  const m = (model ?? "").trim().toLowerCase();
  if (isMicrosoftDecision1ModelId(i) || isMicrosoftDecision1ModelId(m)) return true;
  if (i.includes("microsoft-decision") || m.includes("microsoft-decision")) return true;
  if ((i.includes("openrouter") || m.startsWith("openrouter/")) && m.includes("decision")) {
    return true;
  }
  return false;
}

/** Convert OpenAI Decisions questions → OpenRouter map (criteria shape). */
export function openAiQuestionsToOpenRouterMap(
  questions: readonly OpenAiDecisionQuestion[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    if (q.type === "choice") {
      const criteria: Record<string, string> = {};
      for (const c of q.choices) {
        criteria[c.value] = c.description?.trim() || c.value;
      }
      out[q.name] = {
        type: "choice",
        instructions: q.instructions?.trim() || q.name,
        criteria,
      };
      continue;
    }
    if (q.type === "predicate") {
      out[q.name] = {
        type: "noul",
        instructions: q.instructions,
        criteria: {
          true: q.instructions,
          false: `Not: ${q.instructions}`,
        },
      };
      continue;
    }
    if (q.type === "score") {
      out[q.name] = {
        type: "score",
        instructions: q.instructions?.trim() || q.name,
        criteria: q.levels.map((l) => l.description?.trim() || l.label),
      };
    }
  }
  return out;
}

type OpenRouterAnswerMap = Record<string, Record<string, unknown>>;

export function openRouterAnswersToOpenAi(
  answers: OpenRouterAnswerMap,
  model: string,
  id: string
): OpenAiDecisionCreateResponse {
  const converted: OpenAiDecisionAnswer[] = [];
  for (const [name, raw] of Object.entries(answers)) {
    const type = typeof raw.type === "string" ? raw.type : "";
    if (type === "choice") {
      const probsRaw = raw.probabilities;
      const probabilities: Array<{ value: string; probability: number }> = [];
      if (probsRaw && typeof probsRaw === "object" && !Array.isArray(probsRaw)) {
        for (const [value, p] of Object.entries(probsRaw as Record<string, unknown>)) {
          if (typeof p === "number") probabilities.push({ value, probability: p });
        }
      }
      converted.push({
        type: "choice",
        name,
        choice: String(raw.choice ?? ""),
        confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
        probabilities,
      });
      continue;
    }
    if (type === "noul") {
      const p = typeof raw.noul === "number" ? raw.noul : 0;
      converted.push({ type: "predicate", name, probability: p });
      continue;
    }
    if (type === "score") {
      const probsRaw = raw.probabilities;
      const probabilities: Array<{ label: string; value: number; probability: number }> = [];
      const legend =
        raw.legend && typeof raw.legend === "object" ? (raw.legend as Record<string, string>) : {};
      if (probsRaw && typeof probsRaw === "object" && !Array.isArray(probsRaw)) {
        for (const [idx, p] of Object.entries(probsRaw as Record<string, unknown>)) {
          if (typeof p !== "number") continue;
          const value = Number(idx);
          probabilities.push({
            label: legend[idx] ?? String(idx),
            value: Number.isFinite(value) ? value : 0,
            probability: p,
          });
        }
      }
      converted.push({
        type: "score",
        name,
        score: typeof raw.score === "number" ? raw.score : 0,
        confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
        probabilities,
      });
    }
  }

  return {
    id,
    object: "decision",
    model,
    created: Math.floor(Date.now() / 1000),
    answers: converted,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    calibrated: false,
    escalated: false,
    backend_id: `openrouter/${model}`,
    trace_id: id,
  };
}

/**
 * Forward OpenAI-shaped Decisions body to OpenRouter alpha Decisions API.
 * Forced host boundary — Promise façade over Effect.tryPromise for fetch.
 */
export async function callRemoteOpenRouterDecisions(
  body: OpenAiDecisionCreateRequest,
  options: CallOpenRouterDecisionsOptions = {}
): Promise<OpenAiDecisionCreateResponse> {
  return Effect.runPromise(callRemoteOpenRouterDecisionsEffect(body, options));
}

export function callRemoteOpenRouterDecisionsEffect(
  body: OpenAiDecisionCreateRequest,
  options: CallOpenRouterDecisionsOptions = {}
): Effect.Effect<OpenAiDecisionCreateResponse, Error> {
  return Effect.gen(function* () {
    const env = options.env ?? process.env;
    const cfg = readOpenRouterDecisionsConfigFromEnv(env);
    const apiKey = options.apiKey ?? cfg.apiKey;
    if (!apiKey) {
      return yield* Effect.fail(
        new Error("OPENROUTER_API_KEY (or CLAWQL_DECISIONS_OPENROUTER_API_KEY) is required")
      );
    }
    const base = (options.baseUrl ?? cfg.baseUrl).replace(/\/$/, "");
    const url = base.endsWith("/decisions") ? base : `${base}/decisions`;
    const model = resolveOpenRouterDecisionsModel(body.model);
    const state =
      typeof body.input === "string"
        ? body.input
        : body.input
            .map((m) => {
              if (typeof m.content === "string") return m.content;
              return m.content
                .filter((p) => p.type === "input_text")
                .map((p) => ("text" in p ? p.text : ""))
                .join("\n");
            })
            .join("\n");
    const questions = openAiQuestionsToOpenRouterMap(body.questions);
    const fetchImpl = options.fetchImpl ?? fetch;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    const referer = options.httpReferer ?? cfg.httpReferer;
    const title = options.appTitle ?? cfg.appTitle;
    if (referer) headers["HTTP-Referer"] = referer;
    if (title) headers["X-Title"] = title;

    const res = yield* Effect.tryPromise({
      try: () =>
        fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, state, questions }),
        }),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    const text = yield* Effect.tryPromise({
      try: () => res.text(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return yield* Effect.fail(
        new Error(`OpenRouter decisions returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
      );
    }
    if (!res.ok) {
      const err = json as { error?: { message?: string }; message?: string };
      return yield* Effect.fail(
        new Error(err.error?.message || err.message || `OpenRouter decisions HTTP ${res.status}`)
      );
    }
    const raw = json as {
      id?: string;
      model?: string;
      answers?: OpenRouterAnswerMap;
    };
    if (!raw.answers || typeof raw.answers !== "object") {
      return yield* Effect.fail(new Error("OpenRouter decisions response missing answers map"));
    }
    return openRouterAnswersToOpenAi(
      raw.answers,
      raw.model || model,
      raw.id || `openrouter-dec-${Date.now()}`
    );
  });
}

export class OpenRouterDecisionsService extends Context.Service<
  OpenRouterDecisionsService,
  {
    readonly available: () => Effect.Effect<boolean>;
    readonly call: (
      body: OpenAiDecisionCreateRequest
    ) => Effect.Effect<OpenAiDecisionCreateResponse, Error>;
  }
>()("clawql/inference/OpenRouterDecisionsService") {}

export function makeOpenRouterDecisionsLive(
  opts: CallOpenRouterDecisionsOptions = {}
): Layer.Layer<OpenRouterDecisionsService> {
  return Layer.succeed(OpenRouterDecisionsService, {
    available: () => Effect.sync(() => remoteOpenRouterDecisionsAvailable(opts.env ?? process.env)),
    call: (body) => callRemoteOpenRouterDecisionsEffect(body, opts),
  });
}

export const OpenRouterDecisionsLive = makeOpenRouterDecisionsLive();

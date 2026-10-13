/**
 * Convai Laya SystemOne client (measure + optional pin).
 *
 * Self-host only: CLAWQL_LAYA_SYSTEMONE_URL → POST {base}/v1/systemone
 * (pip install "laya[serve]"; LAYA_DEVICE=cpu laya-serve).
 *
 * Apache-2.0 encoder (~322–421M) — CPU-class peer to GLiNER2.5-Decide.
 * Never lights productionTrusted (backendId ≠ gliner2).
 */

import { Effect } from "effect";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";
import {
  openAiQuestionsToOpenRouterMap,
  openRouterAnswersToOpenAi,
} from "./remote-openrouter-decisions.js";

export const LAYA_BACKEND_ID = "convai/laya" as const;
export const DEFAULT_LAYA_MODEL = "english";

export type CallLayaOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly systemOneUrl?: string;
  readonly apiToken?: string;
  readonly model?: string;
};

export type LayaConfig = {
  readonly systemOneUrl?: string;
  readonly apiToken?: string;
  readonly model: string;
};

export function readLayaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LayaConfig {
  const systemOneUrl =
    env.CLAWQL_LAYA_SYSTEMONE_URL?.trim() || env.CLAWQL_LAYA_BASE_URL?.trim() || undefined;
  const apiToken = env.CLAWQL_LAYA_API_TOKEN?.trim() || undefined;
  const model = env.CLAWQL_LAYA_MODEL?.trim() || DEFAULT_LAYA_MODEL;
  return { systemOneUrl, apiToken, model };
}

export function selfHostedLayaAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(readLayaConfigFromEnv(env).systemOneUrl);
}

export function isLayaBackendId(id: string, model?: string): boolean {
  const blob = `${id} ${model ?? ""}`.toLowerCase();
  return blob.includes("laya") || blob.includes("convai/laya");
}

function extractState(body: OpenAiDecisionCreateRequest): string {
  if (typeof body.input === "string") return body.input;
  return body.input
    .map((msg) => {
      if (typeof msg.content === "string") return msg.content;
      return msg.content
        .filter((p) => p.type === "input_text")
        .map((p) => ("text" in p ? p.text : ""))
        .join("\n");
    })
    .join("\n");
}

function resolveSystemOneUrl(raw: string): string {
  const base = raw.replace(/\/$/, "");
  if (base.endsWith("/systemone") || base.endsWith("/v1/systemone")) return base;
  return `${base}/v1/systemone`;
}

type SystemOneResponse = {
  readonly model?: string;
  readonly answers?: Record<string, Record<string, unknown>>;
  readonly usage?: unknown;
};

function asAnswerMap(raw: unknown): Record<string, Record<string, unknown>> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, Record<string, unknown>>;
}

function parseSystemOneEnvelope(json: unknown): SystemOneResponse {
  if (!json || typeof json !== "object") {
    throw new Error("Laya SystemOne returned non-object JSON");
  }
  const root = json as Record<string, unknown>;
  const candidates: unknown[] = [root, root.result, root.response];
  for (const cand of candidates) {
    if (!cand || typeof cand !== "object") continue;
    const obj = cand as Record<string, unknown>;
    const answers = asAnswerMap(obj.answers);
    if (answers) {
      return {
        model: typeof obj.model === "string" ? obj.model : undefined,
        answers,
        usage: obj.usage,
      };
    }
  }
  const snippet = JSON.stringify(json).slice(0, 280);
  throw new Error(
    `Laya response missing answers map; keys=${Object.keys(root).join(",")}; body=${snippet}`
  );
}

export function callRemoteLayaEffect(
  body: OpenAiDecisionCreateRequest,
  options: CallLayaOptions = {}
): Effect.Effect<OpenAiDecisionCreateResponse, Error> {
  return Effect.gen(function* () {
    const env = options.env ?? process.env;
    const cfg = readLayaConfigFromEnv(env);
    const systemOneUrl = options.systemOneUrl ?? cfg.systemOneUrl;
    if (!systemOneUrl) {
      return yield* Effect.fail(
        new Error("Laya requires CLAWQL_LAYA_SYSTEMONE_URL (self-host laya-serve)")
      );
    }
    const fetchImpl = options.fetchImpl ?? fetch;
    const model = options.model?.trim() || body.model?.trim() || cfg.model;
    const state = extractState(body);
    const questions = openAiQuestionsToOpenRouterMap(body.questions);
    const requestBody = {
      model,
      state,
      questions,
    };
    const url = resolveSystemOneUrl(systemOneUrl);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = options.apiToken ?? cfg.apiToken;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = yield* Effect.tryPromise({
      try: () =>
        fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
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
        new Error(`Laya SystemOne non-JSON (${res.status}): ${text.slice(0, 200)}`)
      );
    }
    if (!res.ok) {
      return yield* Effect.fail(
        new Error(
          `Laya SystemOne HTTP ${res.status}: ${typeof json === "object" ? JSON.stringify(json).slice(0, 200) : text.slice(0, 200)}`
        )
      );
    }

    const parsed = yield* Effect.try({
      try: () => parseSystemOneEnvelope(json),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    const modelId = typeof parsed.model === "string" ? parsed.model : model;
    const openAi = openRouterAnswersToOpenAi(
      parsed.answers ?? {},
      modelId,
      `laya-${Date.now()}`,
      body.use_site_id
    );
    return {
      ...openAi,
      backend_id: LAYA_BACKEND_ID,
      calibrated: false,
    };
  });
}

export async function callRemoteLaya(
  body: OpenAiDecisionCreateRequest,
  options: CallLayaOptions = {}
): Promise<OpenAiDecisionCreateResponse> {
  return Effect.runPromise(callRemoteLayaEffect(body, options));
}

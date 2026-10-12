/**
 * Cloudflare Clef / Clef-Flash SystemOne client (measure + optional pin).
 *
 * Two transports:
 * - Workers AI: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID →
 *   POST .../ai/run/@cf/cloudflare/{clef|clef-flash}
 * - Self-host: CLAWQL_CLEF_SYSTEMONE_URL → POST {base}/v1/systemone (SGLang etc.)
 *
 * Apache-2.0 weights on Hugging Face; official stack prefers self-host.
 * Workers AI is measure fill only — never lights productionTrusted.
 */

import { Effect } from "effect";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";
import {
  openAiQuestionsToOpenRouterMap,
  openRouterAnswersToOpenAi,
} from "./remote-openrouter-decisions.js";

export type ClefVariant = "clef-flash" | "clef";

export const DEFAULT_CLEF_VARIANT: ClefVariant = "clef-flash";
export const CLEF_FLASH_BACKEND_ID = "cloudflare/clef-flash" as const;
export const CLEF_BACKEND_ID = "cloudflare/clef" as const;

export type CallClefOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly apiToken?: string;
  readonly accountId?: string;
  /** Full SystemOne URL or origin; when set, skips Workers AI. */
  readonly systemOneUrl?: string;
  readonly variant?: ClefVariant;
};

export type ClefConfig = {
  readonly apiToken?: string;
  readonly accountId?: string;
  readonly systemOneUrl?: string;
  readonly variant: ClefVariant;
};

export function resolveClefVariant(raw?: string): ClefVariant {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "clef" || v === "@cf/cloudflare/clef" || v === "cloudflare/clef") {
    return "clef";
  }
  return "clef-flash";
}

export function clefBackendId(variant: ClefVariant = DEFAULT_CLEF_VARIANT): string {
  return variant === "clef" ? CLEF_BACKEND_ID : CLEF_FLASH_BACKEND_ID;
}

export function readClefConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ClefConfig {
  const apiToken =
    env.CLAWQL_CLEF_API_TOKEN?.trim() ||
    env.CLOUDFLARE_AUTH_TOKEN?.trim() ||
    env.CLAWQL_CLOUDFLARE_API_TOKEN?.trim() ||
    env.CLOUDFLARE_API_TOKEN?.trim() ||
    undefined;
  const accountId =
    env.CLAWQL_CLEF_ACCOUNT_ID?.trim() ||
    env.CLAWQL_CLOUDFLARE_ACCOUNT_ID?.trim() ||
    env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    env.CLAWQL_R2_ACCOUNT_ID?.trim() ||
    undefined;
  const systemOneUrl =
    env.CLAWQL_CLEF_SYSTEMONE_URL?.trim() || env.CLAWQL_CLEF_BASE_URL?.trim() || undefined;
  const variant = resolveClefVariant(env.CLAWQL_CLEF_MODEL?.trim() || DEFAULT_CLEF_VARIANT);
  return { apiToken, accountId, systemOneUrl, variant };
}

export function remoteClefAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = readClefConfigFromEnv(env);
  if (cfg.systemOneUrl) return true;
  return Boolean(cfg.apiToken && cfg.accountId);
}

export function isClefBackendId(id: string, model?: string): boolean {
  const i = id.trim().toLowerCase();
  const m = (model ?? "").trim().toLowerCase();
  const blob = `${i} ${m}`;
  return (
    blob.includes("clef-flash") ||
    blob.includes("@cf/cloudflare/clef") ||
    /(^|\/)clef(\b|$)/.test(i) ||
    /(^|\/)clef(\b|$)/.test(m) ||
    blob.includes("cloudflare/clef")
  );
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

function workersAiUrl(accountId: string, variant: ClefVariant): string {
  const modelPath = variant === "clef" ? "clef" : "clef-flash";
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/cloudflare/${modelPath}`;
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

function coerceJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** Normalize Clef/Workers AI envelopes → SystemOne answers map. */
function parseWorkersAiEnvelope(json: unknown): SystemOneResponse {
  if (!json || typeof json !== "object") {
    throw new Error("Clef Workers AI returned non-object JSON");
  }
  const root = json as Record<string, unknown>;
  if (root.success === false) {
    const errors = root.errors;
    const msg =
      Array.isArray(errors) && errors[0] && typeof errors[0] === "object"
        ? String((errors[0] as { message?: string }).message ?? "Workers AI error")
        : "Workers AI error";
    throw new Error(msg);
  }
  // Common shapes:
  // 1) { success, result: { model, answers } }
  // 2) { model, answers } (self-host / bare SystemOne)
  // 3) { success, result: { response: { model, answers } } }  (± response as JSON string)
  // 4) { result: { result: { answers } } }
  const resultObj = coerceJsonObject(root.result);
  const candidates: unknown[] = [
    root,
    resultObj,
    coerceJsonObject(root.response),
    resultObj ? coerceJsonObject(resultObj.response) : undefined,
    resultObj ? coerceJsonObject(resultObj.result) : undefined,
  ];
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
    `Clef response missing answers map; keys=${Object.keys(root).join(",")}; body=${snippet}`
  );
}

export function callRemoteClefEffect(
  body: OpenAiDecisionCreateRequest,
  options: CallClefOptions = {}
): Effect.Effect<OpenAiDecisionCreateResponse, Error> {
  return Effect.gen(function* () {
    const env = options.env ?? process.env;
    const cfg = readClefConfigFromEnv(env);
    const variant =
      options.variant ?? (body.model?.trim() ? resolveClefVariant(body.model) : cfg.variant);
    const systemOneUrl = options.systemOneUrl ?? cfg.systemOneUrl;
    const fetchImpl = options.fetchImpl ?? fetch;
    const state = extractState(body);
    const questions = openAiQuestionsToOpenRouterMap(body.questions);
    const requestBody = {
      model: variant,
      state,
      questions,
    };

    let json: unknown;
    if (systemOneUrl) {
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
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        return yield* Effect.fail(
          new Error(`Clef SystemOne non-JSON (${res.status}): ${text.slice(0, 200)}`)
        );
      }
      if (!res.ok) {
        return yield* Effect.fail(
          new Error(
            `Clef SystemOne HTTP ${res.status}: ${typeof json === "object" ? JSON.stringify(json).slice(0, 200) : text.slice(0, 200)}`
          )
        );
      }
    } else {
      const apiToken = options.apiToken ?? cfg.apiToken;
      const accountId = options.accountId ?? cfg.accountId;
      if (!apiToken || !accountId) {
        return yield* Effect.fail(
          new Error(
            "Clef requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, or CLAWQL_CLEF_SYSTEMONE_URL for self-host"
          )
        );
      }
      const url = workersAiUrl(accountId, variant);
      const res = yield* Effect.tryPromise({
        try: () =>
          fetchImpl(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      });
      const text = yield* Effect.tryPromise({
        try: () => res.text(),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      });
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        return yield* Effect.fail(
          new Error(`Clef Workers AI non-JSON (${res.status}): ${text.slice(0, 200)}`)
        );
      }
      if (!res.ok) {
        return yield* Effect.fail(
          new Error(
            `Clef Workers AI HTTP ${res.status}: ${typeof json === "object" ? JSON.stringify(json).slice(0, 200) : text.slice(0, 200)}`
          )
        );
      }
    }

    const parsed = yield* Effect.try({
      try: () => parseWorkersAiEnvelope(json),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    const modelId = typeof parsed.model === "string" ? parsed.model : variant;
    const openAi = openRouterAnswersToOpenAi(
      parsed.answers ?? {},
      modelId,
      `clef-${Date.now()}`,
      body.use_site_id
    );
    return {
      ...openAi,
      backend_id: clefBackendId(variant),
      calibrated: false,
    };
  });
}

export async function callRemoteClef(
  body: OpenAiDecisionCreateRequest,
  options: CallClefOptions = {}
): Promise<OpenAiDecisionCreateResponse> {
  return Effect.runPromise(callRemoteClefEffect(body, options));
}

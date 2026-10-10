/**
 * Remote OpenAI Decisions API client (gpt-6-luna) for escalate / model pin.
 */

import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";

export type CallRemoteDecisionsOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
};

function resolveOpenAiBase(env: NodeJS.ProcessEnv): string {
  const raw =
    env.CLAWQL_DECISIONS_OPENAI_BASE_URL?.trim() ||
    env.OPENAI_BASE_URL?.trim() ||
    "https://api.openai.com/v1";
  return raw.replace(/\/$/, "");
}

function resolveOpenAiKey(env: NodeJS.ProcessEnv): string | undefined {
  return env.CLAWQL_DECISIONS_OPENAI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || undefined;
}

export function remoteLunaAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(resolveOpenAiKey(env));
}

/**
 * Forward a Decisions-shaped body to OpenAI (or OpenAI-compatible upstream).
 * Path is always `{base}/decisions` (base may already include `/v1`).
 */
export async function callRemoteOpenAiDecisions(
  body: OpenAiDecisionCreateRequest,
  options: CallRemoteDecisionsOptions = {}
): Promise<OpenAiDecisionCreateResponse> {
  const env = options.env ?? process.env;
  const apiKey = options.apiKey ?? resolveOpenAiKey(env);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY (or CLAWQL_DECISIONS_OPENAI_API_KEY) is required for Luna");
  }
  const base = (options.baseUrl ?? resolveOpenAiBase(env)).replace(/\/$/, "");
  const url = base.endsWith("/decisions") ? base : `${base}/decisions`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: body.model.includes("luna") ? "gpt-6-luna" : body.model,
      input: body.input,
      questions: body.questions,
    }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Remote decisions returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const err = json as { error?: { message?: string } };
    throw new Error(err.error?.message || `Remote decisions HTTP ${res.status}`);
  }
  return json as OpenAiDecisionCreateResponse;
}

export function enrichRemoteWithClawql(
  remote: OpenAiDecisionCreateResponse,
  extras: {
    useSiteId: string;
    backendId: string;
    calibrated: boolean;
    escalated: boolean;
    traceId: string;
  }
): OpenAiDecisionCreateResponse {
  return {
    ...remote,
    usage: remote.usage ?? {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    calibrated: extras.calibrated,
    escalated: extras.escalated,
    use_site_id: extras.useSiteId,
    backend_id: extras.backendId,
    trace_id: extras.traceId || remote.trace_id || remote.id,
    clawql: {
      object: "clawql.decision",
      escalation_model: remote.model,
    },
  };
}

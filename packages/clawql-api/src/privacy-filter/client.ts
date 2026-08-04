/**
 * Local Privacy Filter HTTP client (OpenAI Privacy Filter / compatible token-classifier sidecar).
 * Runs on-operator hardware only — no cloud PII API. Backup layer after Presidio when both enabled.
 * @see https://huggingface.co/openai/privacy-filter
 * @see docs/security/privacy-filter-local.md
 */

export type PrivacyFilterSpan = {
  entity_group: string;
  start: number;
  end: number;
  score?: number;
};

export type PrivacyFilterConfig = {
  baseUrl: string;
  failurePolicy: "block" | "warn";
  /** Model id for logging / health; sidecar owns the local weights. */
  modelId: string;
};

export function privacyFilterEnabled(): boolean {
  return process.env.CLAWQL_ENABLE_PRIVACY_FILTER?.trim() === "1";
}

export function loadPrivacyFilterConfig(): PrivacyFilterConfig | null {
  if (!privacyFilterEnabled()) return null;
  const baseUrl = process.env.CLAWQL_PRIVACY_FILTER_URL?.trim() ?? "http://127.0.0.1:8091";
  const failureRaw = process.env.CLAWQL_PRIVACY_FILTER_FAILURE_POLICY?.trim().toLowerCase();
  // Default warn: ML sidecar should not brick the gateway when Presidio already ran (or alone).
  const failurePolicy = failureRaw === "block" ? "block" : "warn";
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    failurePolicy,
    modelId: process.env.CLAWQL_PRIVACY_FILTER_MODEL?.trim() || "openai/privacy-filter",
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Privacy Filter ${url} failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

export type PrivacyFilterRedactResult = {
  text: string;
  redacted: boolean;
  spans?: PrivacyFilterSpan[];
  mode?: string;
};

export async function privacyFilterRedactText(
  text: string,
  config: PrivacyFilterConfig = loadPrivacyFilterConfig()!
): Promise<PrivacyFilterRedactResult> {
  if (!text.trim()) return { text, redacted: false };

  const body = await postJson<{
    ok?: boolean;
    text?: string;
    spans?: PrivacyFilterSpan[];
    mode?: string;
    local?: boolean;
    error?: string;
  }>(`${config.baseUrl}/redact`, {
    text,
    model_id: config.modelId,
  });

  if (body.ok === false || typeof body.text !== "string") {
    throw new Error(body.error ?? "Privacy Filter redact returned no text");
  }

  return {
    text: body.text,
    redacted: body.text !== text,
    spans: body.spans,
    mode: body.mode,
  };
}

export async function maybePrivacyFilterRedactText(text: string): Promise<string> {
  const config = loadPrivacyFilterConfig();
  if (!config) return text;
  try {
    const result = await privacyFilterRedactText(text, config);
    return result.text;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (config.failurePolicy === "warn") {
      console.error(`[clawql-privacy-filter] warning: ${msg}`);
      return text;
    }
    throw e;
  }
}

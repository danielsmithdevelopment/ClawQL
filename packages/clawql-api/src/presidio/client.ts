/**
 * Microsoft Presidio HTTP client (analyzer + anonymizer).
 * @see https://microsoft.github.io/presidio/
 */

export type PresidioAnalyzerResult = {
  entity_type: string;
  start: number;
  end: number;
  score: number;
};

export type PresidioConfig = {
  analyzerUrl: string;
  anonymizerUrl: string;
  language?: string;
  failurePolicy: "block" | "warn";
};

export function presidioEnabled(): boolean {
  return process.env.CLAWQL_ENABLE_PRESIDIO?.trim() === "1";
}

export function loadPresidioConfig(): PresidioConfig | null {
  if (!presidioEnabled()) return null;
  const analyzerUrl =
    process.env.CLAWQL_PRESIDIO_ANALYZER_URL?.trim() ?? "http://127.0.0.1:3000";
  const anonymizerUrl =
    process.env.CLAWQL_PRESIDIO_ANONYMIZER_URL?.trim() ?? "http://127.0.0.1:3001";
  const failureRaw = process.env.CLAWQL_PRESIDIO_FAILURE_POLICY?.trim().toLowerCase();
  const failurePolicy = failureRaw === "warn" ? "warn" : "block";
  return {
    analyzerUrl: analyzerUrl.replace(/\/$/, ""),
    anonymizerUrl: anonymizerUrl.replace(/\/$/, ""),
    language: process.env.CLAWQL_PRESIDIO_LANGUAGE?.trim() || "en",
    failurePolicy,
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
    throw new Error(`Presidio ${url} failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

export async function presidioRedactText(
  text: string,
  config: PresidioConfig = loadPresidioConfig()!
): Promise<{ text: string; redacted: boolean }> {
  if (!text.trim()) return { text, redacted: false };

  const analyzerResults = await postJson<PresidioAnalyzerResult[]>(
    `${config.analyzerUrl}/analyze`,
    {
      text,
      language: config.language ?? "en",
    }
  );

  if (!analyzerResults.length) {
    return { text, redacted: false };
  }

  const anonymized = await postJson<{ text: string }>(`${config.anonymizerUrl}/anonymize`, {
    text,
    analyzer_results: analyzerResults,
  });

  return { text: anonymized.text, redacted: anonymized.text !== text };
}

export async function maybePresidioRedactText(text: string): Promise<string> {
  const config = loadPresidioConfig();
  if (!config) return text;
  try {
    const result = await presidioRedactText(text, config);
    return result.text;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (config.failurePolicy === "warn") {
      console.error(`[clawql-presidio] warning: ${msg}`);
      return text;
    }
    throw e;
  }
}

/**
 * Redact string fields in a JSON-like tool payload (shallow + one nested level).
 */
export async function presidioRedactPayload(value: unknown): Promise<unknown> {
  if (typeof value === "string") {
    return maybePresidioRedactText(value);
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((v) => presidioRedactPayload(v)));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await presidioRedactPayload(v);
    }
    return out;
  }
  return value;
}

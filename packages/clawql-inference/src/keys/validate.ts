import { isBudgetExceeded } from "./budget.js";
import { checkRateLimit } from "./rate-limit.js";
import { findKeyBySecret, loadVirtualKeyStoreSync } from "./store.js";
import type { KeyValidationResult } from "./types.js";

export type AuthHeaderSource = Record<string, string | string[] | undefined>;

function headerValue(headers: AuthHeaderSource, name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(v)) return v[0]?.trim();
  return typeof v === "string" ? v.trim() : undefined;
}

export function extractPresentedApiKey(headers: AuthHeaderSource): string | undefined {
  const bearer = headerValue(headers, "authorization");
  const apiKeyHeader =
    headerValue(headers, "x-api-key") ?? headerValue(headers, "x-clawql-api-key");
  return (
    apiKeyHeader ?? (bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : bearer)
  );
}

export function validateVirtualKey(
  secret: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): KeyValidationResult {
  if (!secret) {
    return {
      ok: false,
      status: 401,
      message: "Invalid or missing API key",
      type: "authentication_error",
    };
  }

  const store = loadVirtualKeyStoreSync(env);
  const key = findKeyBySecret(store, secret);
  if (!key) {
    return {
      ok: false,
      status: 401,
      message: "Invalid or missing API key",
      type: "authentication_error",
    };
  }

  if (isBudgetExceeded(key.spentUsd, key.budgetUsd)) {
    return {
      ok: false,
      status: 402,
      message: `Budget exceeded for team "${key.team}"`,
      type: "insufficient_quota",
    };
  }

  if (key.rateLimit && !checkRateLimit(key.id, key.rateLimit)) {
    return {
      ok: false,
      status: 429,
      message: "Rate limit exceeded",
      type: "rate_limit_exceeded",
    };
  }

  return {
    ok: true,
    context: {
      id: key.id,
      team: key.team,
      budgetUsd: key.budgetUsd,
    },
  };
}

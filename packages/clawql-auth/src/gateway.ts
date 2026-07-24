/**
 * Gateway authentication modes and ATR claim resolution (Phase 1).
 */

import { timingSafeEqual } from "node:crypto";

export type AuthMode = "noAuth" | "apiKey";

function apiKeysEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Compare against self to keep runtime roughly constant on length mismatch.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export type AtrClaims = {
  sub: string;
  role: string;
  scope: string[];
  tenantId?: string;
  verticals?: string[];
  /** Present when auth succeeded via an inference virtual key. */
  virtualKeyId?: string;
};

/**
 * Optional sync resolver for presented API keys that are not the static
 * `CLAWQL_API_KEY` (e.g. clawql-inference virtual keys). Injected by the MCP
 * HTTP process so `clawql-auth` stays free of an inference dependency.
 */
export type ApiKeyClaimsResolver = (
  presented: string,
  headers: AuthHeaderSource
) => { ok: true; claims: AtrClaims } | { ok: false; error: string } | null;

export type GatewayAuthConfig = {
  mode: AuthMode;
  apiKey?: string;
  /** Tried when presented key does not match static `apiKey` (or apiKey is unset). */
  apiKeyClaimsResolver?: ApiKeyClaimsResolver;
};

export function resolveAuthMode(): AuthMode {
  const raw = process.env.CLAWQL_AUTH_MODE?.trim().toLowerCase();
  if (raw === "apikey" || raw === "api_key" || raw === "api-key") return "apiKey";
  return "noAuth";
}

export function loadGatewayAuthConfig(): GatewayAuthConfig {
  const mode = resolveAuthMode();
  const apiKey = process.env.CLAWQL_API_KEY?.trim();
  return { mode, apiKey: apiKey || undefined };
}

/** Permissive default when gateway auth is noAuth (modularization §4.3). */
export function defaultAdminAtrClaims(subject = "local"): AtrClaims {
  return {
    sub: subject,
    role: "admin",
    scope: ["*"],
  };
}

export type AuthHeaderSource = Record<string, string | string[] | undefined>;

function headerValue(headers: AuthHeaderSource, name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(v)) return v[0]?.trim();
  return typeof v === "string" ? v.trim() : undefined;
}

/**
 * Validate incoming MCP/HTTP credentials and produce ATR-shaped claims for the gateway.
 */
export function resolveAtrClaimsFromHeaders(
  headers: AuthHeaderSource = {},
  config: GatewayAuthConfig = loadGatewayAuthConfig()
): { ok: true; claims: AtrClaims } | { ok: false; error: string } {
  if (config.mode === "noAuth") {
    const sub = headerValue(headers, "x-clawql-subject") ?? "local";
    return { ok: true, claims: defaultAdminAtrClaims(sub) };
  }

  const bearer = headerValue(headers, "authorization");
  const apiKeyHeader =
    headerValue(headers, "x-api-key") ?? headerValue(headers, "x-clawql-api-key");
  const presented =
    apiKeyHeader ?? (bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : bearer);

  if (!presented) {
    return { ok: false, error: "Invalid or missing API key" };
  }

  // 1) Injected resolver first (inference virtual keys → tenantId from key.team).
  // Prefer VK over static CLAWQL_API_KEY so managed gateways that set both to the
  // same secret still get tenant claims (not spoofable client headers).
  if (config.apiKeyClaimsResolver) {
    const resolved = config.apiKeyClaimsResolver(presented, headers);
    if (resolved) return resolved;
  }

  // 2) Static CLAWQL_API_KEY (legacy / bootstrap)
  if (config.apiKey && apiKeysEqual(presented, config.apiKey)) {
    return {
      ok: true,
      claims: {
        sub: headerValue(headers, "x-clawql-subject") ?? "api-key",
        role: headerValue(headers, "x-clawql-role") ?? "operator",
        scope: ["execute", "search", "memory"],
      },
    };
  }

  if (!config.apiKey && !config.apiKeyClaimsResolver) {
    return { ok: false, error: "CLAWQL_AUTH_MODE=apiKey but CLAWQL_API_KEY is unset" };
  }

  return { ok: false, error: "Invalid or missing API key" };
}

export function assertGatewayAuth(headers: AuthHeaderSource = {}): AtrClaims {
  const result = resolveAtrClaimsFromHeaders(headers);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.claims;
}

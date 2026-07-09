/**
 * Gateway authentication modes and ATR claim resolution (Phase 1).
 */

export type AuthMode = "noAuth" | "apiKey";

export type AtrClaims = {
  sub: string;
  role: string;
  scope: string[];
  tenantId?: string;
  verticals?: string[];
};

export type GatewayAuthConfig = {
  mode: AuthMode;
  apiKey?: string;
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

  if (!config.apiKey) {
    return { ok: false, error: "CLAWQL_AUTH_MODE=apiKey but CLAWQL_API_KEY is unset" };
  }
  if (!presented || presented !== config.apiKey) {
    return { ok: false, error: "Invalid or missing API key" };
  }

  return {
    ok: true,
    claims: {
      sub: headerValue(headers, "x-clawql-subject") ?? "api-key",
      role: headerValue(headers, "x-clawql-role") ?? "operator",
      scope: ["execute", "search", "memory"],
    },
  };
}

export function assertGatewayAuth(headers: AuthHeaderSource = {}): AtrClaims {
  const result = resolveAtrClaimsFromHeaders(headers);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.claims;
}

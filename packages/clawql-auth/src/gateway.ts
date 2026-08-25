/**
 * Gateway authentication modes and ATR claim resolution.
 * Modes: noAuth | apiKey | oidc (JWT consumer — ClawQL is not an IdP).
 */

import { timingSafeEqual } from "node:crypto";
import { Data, Effect } from "effect";

import {
  loadOidcAuthConfig,
  resolveOidcAtrClaimsFromHeadersEffect,
  type OidcAuthConfig,
} from "./oidc.js";

export type AuthMode = "noAuth" | "apiKey" | "oidc" | "mcpOAuth";

/** Typed failure for gateway auth resolution (Effect failure channel). */
export class GatewayAuthError extends Data.TaggedError("GatewayAuthError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

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
  /**
   * Authentication Context Class Reference from the IdP (OIDC `acr`).
   * Used by policy hooks (e.g. require MFA for financial tools).
   */
  acr?: string;
  /** Authentication Methods References from the IdP (OIDC `amr`). */
  amr?: string[];
  /** Work email from the IdP (`email` claim) — used for company-domain SSO. */
  email?: string;
  /** IdP `email_verified` when present. */
  emailVerified?: boolean;
  /** Lowercased domain portion of `email` (or Google Workspace `hd`). */
  emailDomain?: string;
  /** Company org id when resolved from email domain / claim. */
  orgId?: string;
  /** IdP group membership from EMA / ID-JAG (audit + policy hooks). */
  idpGroups?: string[];
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
  /** OIDC / JWT verify settings when mode is `oidc`. */
  oidc?: OidcAuthConfig;
  /**
   * When set, Bearer tokens issued by {@link MCPOAuthServer} are accepted.
   * Used for `mcpOAuth` mode or hybrid acceptance alongside apiKey/oidc.
   * Effect-primary — no Promise domain API.
   */
  mcpOAuthValidator?: (bearerToken: string) => Effect.Effect<AtrClaims, unknown>;
};

export function resolveAuthMode(env: NodeJS.ProcessEnv = process.env): Effect.Effect<AuthMode> {
  return Effect.sync(() => {
    const raw = env.CLAWQL_AUTH_MODE?.trim().toLowerCase();
    if (raw === "apikey" || raw === "api_key" || raw === "api-key") return "apiKey";
    if (raw === "oidc" || raw === "oauth2") return "oidc";
    if (raw === "mcpoauth" || raw === "mcp_oauth" || raw === "mcp-oauth") return "mcpOAuth";
    return "noAuth";
  });
}

export function loadGatewayAuthConfig(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<GatewayAuthConfig> {
  return Effect.gen(function* () {
    const mode = yield* resolveAuthMode(env);
    const apiKey = env.CLAWQL_API_KEY?.trim();
    return {
      mode,
      apiKey: apiKey || undefined,
      oidc: mode === "oidc" ? loadOidcAuthConfig(env) : undefined,
    };
  });
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

function extractBearer(headers: AuthHeaderSource): string | undefined {
  const bearer = headerValue(headers, "authorization");
  if (!bearer) return undefined;
  const m = /^Bearer\s+(\S+)/i.exec(bearer);
  return m?.[1] ?? (bearer.includes(" ") ? undefined : bearer);
}

function tryMcpOAuthValidator(
  headers: AuthHeaderSource,
  config: GatewayAuthConfig
): Effect.Effect<AtrClaims | null> {
  return Effect.gen(function* () {
    const validator = config.mcpOAuthValidator;
    if (!validator) return null;
    const token = extractBearer(headers);
    if (!token) return null;
    return yield* validator(token).pipe(Effect.catchAll(() => Effect.succeed(null)));
  });
}

function headerValue(headers: AuthHeaderSource, name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(v)) return v[0]?.trim();
  return typeof v === "string" ? v.trim() : undefined;
}

/**
 * Sync claim resolution for `noAuth` / `apiKey` (internal helper).
 * For `oidc`, returns an error directing callers to {@link resolveAtrClaimsFromHeadersEffect}.
 */
export function resolveAtrClaimsFromHeaders(
  headers: AuthHeaderSource = {},
  config: GatewayAuthConfig = Effect.runSync(loadGatewayAuthConfig())
): { ok: true; claims: AtrClaims } | { ok: false; error: string } {
  if (config.mode === "oidc" || config.mode === "mcpOAuth") {
    return {
      ok: false,
      error: `CLAWQL_AUTH_MODE=${config.mode} requires async JWT verification — use resolveAtrClaimsFromHeadersEffect`,
    };
  }

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

/**
 * Effect claim resolution — supports `oidc` JWT verify plus sync modes.
 * Failures surface on the typed {@link GatewayAuthError} channel.
 */
export function resolveAtrClaimsFromHeadersEffect(
  headers: AuthHeaderSource = {},
  config: GatewayAuthConfig = Effect.runSync(loadGatewayAuthConfig())
): Effect.Effect<AtrClaims, GatewayAuthError> {
  return Effect.gen(function* () {
    if (config.mcpOAuthValidator) {
      const fromMcp = yield* tryMcpOAuthValidator(headers, config);
      if (fromMcp) return fromMcp;
      if (config.mode === "mcpOAuth") {
        return yield* Effect.fail(
          new GatewayAuthError({ reason: "Invalid or missing MCP OAuth Bearer token" })
        );
      }
    }

    if (config.mode === "oidc") {
      return yield* resolveOidcAtrClaimsFromHeadersEffect(
        headers,
        config.oidc ?? loadOidcAuthConfig()
      ).pipe(
        Effect.mapError((err) => new GatewayAuthError({ reason: err.reason, cause: err.cause }))
      );
    }

    const result = resolveAtrClaimsFromHeaders(headers, config);
    if (result.ok) return result.claims;
    return yield* Effect.fail(new GatewayAuthError({ reason: result.error }));
  });
}

/** Assert gateway auth (Effect form) — fails with {@link GatewayAuthError}. */
export function assertGatewayAuthEffect(
  headers: AuthHeaderSource = {},
  config: GatewayAuthConfig = Effect.runSync(loadGatewayAuthConfig())
): Effect.Effect<AtrClaims, GatewayAuthError> {
  return resolveAtrClaimsFromHeadersEffect(headers, config);
}

/**
 * OIDC / JWT bearer verification for CLAWQL_AUTH_MODE=oidc.
 * ClawQL consumes tokens issued by the customer IdP — it does not issue them.
 */

import { readFileSync } from "node:fs";
import { Data, Effect } from "effect";
import {
  createRemoteJWKSet,
  importSPKI,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

import type { AtrClaims, AuthHeaderSource } from "./gateway.js";
import { assertEmailDomainAllowed } from "./policy.js";

/** Typed failure for OIDC/JWT verification (Effect failure channel). */
export class OidcAuthError extends Data.TaggedError("OidcAuthError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type OidcAuthConfig = {
  jwksUrl?: string;
  publicKeyPemPath?: string;
  /** Tests / development only. */
  hs256Secret?: string;
  issuer?: string;
  audience?: string | string[];
  /** JWT claim that holds an ATR object (default `atr`). */
  atrClaim?: string;
  roleClaim?: string;
  scopeClaim?: string;
  tenantClaim?: string;
  subjectClaim?: string;
  /** JWT claim for work email (default `email`). */
  emailClaim?: string;
  /**
   * Allowed email domains for company SSO (lowercased, no `@`).
   * From `CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS` (comma-separated).
   */
  allowedEmailDomains?: string[];
  /**
   * When true (or when allowedEmailDomains is non-empty), reject tokens whose
   * email domain is missing or not in the allowlist.
   */
  requireEmailDomain?: boolean;
  /** JWT claim for company org id (default `org_id`). */
  orgIdClaim?: string;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseAudience(raw: string | undefined): string | string[] | undefined {
  if (!raw?.trim()) return undefined;
  const t = raw.trim();
  if (t.includes(",")) {
    return t
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return t;
}

function parseDomainList(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const domains = raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return domains.length > 0 ? domains : undefined;
}

export function loadOidcAuthConfig(env: NodeJS.ProcessEnv = process.env): OidcAuthConfig {
  const allowedEmailDomains = parseDomainList(env.CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS);
  const requireEmailDomain =
    envFlag("CLAWQL_AUTH_OIDC_REQUIRE_EMAIL_DOMAIN", env) ||
    (allowedEmailDomains !== undefined && allowedEmailDomains.length > 0);
  return {
    jwksUrl: env.CLAWQL_AUTH_OIDC_JWKS_URL?.trim() || undefined,
    publicKeyPemPath: env.CLAWQL_AUTH_OIDC_PUBLIC_KEY_PEM_PATH?.trim() || undefined,
    hs256Secret: env.CLAWQL_AUTH_OIDC_HS256_SECRET?.trim() || undefined,
    issuer: env.CLAWQL_AUTH_OIDC_ISSUER?.trim() || undefined,
    audience: parseAudience(env.CLAWQL_AUTH_OIDC_AUDIENCE),
    atrClaim: env.CLAWQL_AUTH_OIDC_ATR_CLAIM?.trim() || "atr",
    roleClaim: env.CLAWQL_AUTH_OIDC_ROLE_CLAIM?.trim() || "role",
    scopeClaim: env.CLAWQL_AUTH_OIDC_SCOPE_CLAIM?.trim() || "scope",
    tenantClaim: env.CLAWQL_AUTH_OIDC_TENANT_CLAIM?.trim() || "tenant_id",
    subjectClaim: env.CLAWQL_AUTH_OIDC_SUBJECT_CLAIM?.trim() || "sub",
    emailClaim: env.CLAWQL_AUTH_OIDC_EMAIL_CLAIM?.trim() || "email",
    orgIdClaim: env.CLAWQL_AUTH_OIDC_ORG_CLAIM?.trim() || "org_id",
    allowedEmailDomains,
    requireEmailDomain,
  };
}

let cachedJwks: JWTVerifyGetKey | undefined;
let cachedJwksUrl: string | undefined;
let cachedHs256Secret: Uint8Array | undefined;
let cachedHs256Raw: string | undefined;
let spkiImportPromise: Promise<CryptoKey> | undefined;
let spkiPemPath: string | undefined;

/** Reset JWKS / key caches (tests). */
export function resetOidcVerifyCaches(): void {
  cachedJwks = undefined;
  cachedJwksUrl = undefined;
  cachedHs256Secret = undefined;
  cachedHs256Raw = undefined;
  spkiImportPromise = undefined;
  spkiPemPath = undefined;
}

function resolveVerifyKey(config: OidcAuthConfig): JWTVerifyGetKey {
  if (config.hs256Secret) {
    if (cachedHs256Raw !== config.hs256Secret) {
      cachedHs256Raw = config.hs256Secret;
      cachedHs256Secret = new TextEncoder().encode(config.hs256Secret);
    }
    return async () => cachedHs256Secret!;
  }

  if (config.jwksUrl) {
    if (cachedJwksUrl !== config.jwksUrl || !cachedJwks) {
      cachedJwksUrl = config.jwksUrl;
      cachedJwks = createRemoteJWKSet(new URL(config.jwksUrl));
    }
    return cachedJwks;
  }

  if (config.publicKeyPemPath) {
    const pemPath = config.publicKeyPemPath;
    return async () => {
      if (spkiPemPath !== pemPath) {
        spkiPemPath = pemPath;
        spkiImportPromise = undefined;
      }
      if (!spkiImportPromise) {
        const pem = readFileSync(pemPath, "utf8");
        spkiImportPromise = importSPKI(pem, "RS256");
      }
      return spkiImportPromise;
    };
  }

  throw new Error(
    "CLAWQL_AUTH_MODE=oidc requires one of: CLAWQL_AUTH_OIDC_JWKS_URL, CLAWQL_AUTH_OIDC_PUBLIC_KEY_PEM_PATH, or CLAWQL_AUTH_OIDC_HS256_SECRET (tests/dev only)"
  );
}

function headerValue(headers: AuthHeaderSource, name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(v)) return v[0]?.trim();
  return typeof v === "string" ? v.trim() : undefined;
}

function extractBearer(headers: AuthHeaderSource): string | undefined {
  const bearer = headerValue(headers, "authorization");
  if (!bearer) return undefined;
  const m = /^Bearer\s+(\S+)/i.exec(bearer);
  return m?.[1] ?? (bearer.includes(" ") ? undefined : bearer);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function readNested(payload: JWTPayload, claim: string): unknown {
  if (!claim.includes(".")) return payload[claim];
  let cur: unknown = payload;
  for (const part of claim.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Map a verified JWT payload to ATR-shaped claims.
 * Prefers an embedded ATR object when present; otherwise maps flat OIDC claims.
 */
export function atrClaimsFromJwtPayload(
  payload: JWTPayload,
  config: OidcAuthConfig = {}
): AtrClaims {
  const atrClaim = config.atrClaim ?? "atr";
  const atrRaw = readNested(payload, atrClaim);
  if (atrRaw && typeof atrRaw === "object" && !Array.isArray(atrRaw)) {
    const atr = atrRaw as Record<string, unknown>;
    const sub =
      (typeof atr.sub === "string" && atr.sub) ||
      (typeof payload.sub === "string" ? payload.sub : "oidc");
    const role = typeof atr.role === "string" && atr.role ? atr.role : "operator";
    const scope = asStringArray(atr.scope);
    const claims: AtrClaims = {
      sub,
      role,
      scope: scope.length > 0 ? scope : ["execute", "search", "memory"],
    };
    if (typeof atr.tenantId === "string") claims.tenantId = atr.tenantId;
    else if (typeof atr.tenant_id === "string") claims.tenantId = atr.tenant_id;
    if (typeof atr.orgId === "string") claims.orgId = atr.orgId;
    else if (typeof atr.org_id === "string") claims.orgId = atr.org_id;
    if (Array.isArray(atr.verticals)) {
      claims.verticals = atr.verticals.filter((x): x is string => typeof x === "string");
    }
    if (typeof atr.acr === "string") claims.acr = atr.acr;
    if (Array.isArray(atr.amr)) {
      claims.amr = atr.amr.filter((x): x is string => typeof x === "string");
    }
    return attachEmailClaims(finalizeMfaClaims(claims, payload), payload, config);
  }

  const subjectClaim = config.subjectClaim ?? "sub";
  const roleClaim = config.roleClaim ?? "role";
  const scopeClaim = config.scopeClaim ?? "scope";
  const tenantClaim = config.tenantClaim ?? "tenant_id";
  const orgIdClaim = config.orgIdClaim ?? "org_id";

  const subRaw = readNested(payload, subjectClaim);
  const roleRaw = readNested(payload, roleClaim);
  const scopeRaw = readNested(payload, scopeClaim);
  const tenantRaw = readNested(payload, tenantClaim);
  const orgRaw = readNested(payload, orgIdClaim);

  const claims: AtrClaims = {
    sub: typeof subRaw === "string" && subRaw ? subRaw : "oidc",
    role: typeof roleRaw === "string" && roleRaw ? roleRaw : "operator",
    scope: (() => {
      const s = asStringArray(scopeRaw);
      return s.length > 0 ? s : ["execute", "search", "memory"];
    })(),
  };
  if (typeof tenantRaw === "string" && tenantRaw) claims.tenantId = tenantRaw;
  if (typeof orgRaw === "string" && orgRaw) claims.orgId = orgRaw;
  return attachEmailClaims(finalizeMfaClaims(claims, payload), payload, config);
}

function attachEmailClaims(
  claims: AtrClaims,
  payload: JWTPayload,
  config: OidcAuthConfig
): AtrClaims {
  const emailClaim = config.emailClaim ?? "email";
  const emailRaw = readNested(payload, emailClaim);
  const email =
    typeof emailRaw === "string" && emailRaw.includes("@")
      ? emailRaw.trim().toLowerCase()
      : undefined;
  if (email) {
    claims.email = email;
    claims.emailDomain = email.split("@")[1] || undefined;
  }
  if (!claims.emailDomain && typeof payload.hd === "string" && payload.hd.trim()) {
    claims.emailDomain = payload.hd.trim().toLowerCase();
  }
  if (typeof payload.email_verified === "boolean") {
    claims.emailVerified = payload.email_verified;
  }
  return claims;
}

function finalizeMfaClaims(claims: AtrClaims, payload: JWTPayload): AtrClaims {
  if (!claims.acr && typeof payload.acr === "string") claims.acr = payload.acr;
  if (!claims.amr) {
    const amr = asStringArray(payload.amr);
    if (amr.length > 0) claims.amr = amr;
  }
  return claims;
}

/**
 * Verify a bearer JWT and map it to ATR claims (Effect form).
 * All IO (JWKS fetch, SPKI/PEM read, signature verify) runs inside the Effect;
 * failures surface on the typed {@link OidcAuthError} channel.
 */
export function verifyOidcBearerTokenEffect(
  token: string,
  config: OidcAuthConfig = loadOidcAuthConfig()
): Effect.Effect<{ claims: AtrClaims; payload: JWTPayload }, OidcAuthError> {
  return Effect.gen(function* () {
    const key = yield* Effect.try({
      try: () => resolveVerifyKey(config),
      catch: (cause) => new OidcAuthError({ reason: errorMessage(cause), cause }),
    });
    const { payload } = yield* Effect.tryPromise({
      try: () =>
        jwtVerify(token, key, {
          ...(config.issuer ? { issuer: config.issuer } : {}),
          ...(config.audience ? { audience: config.audience } : {}),
        }),
      catch: (cause) =>
        new OidcAuthError({
          reason: cause instanceof Error ? cause.message : "OIDC JWT verification failed",
          cause,
        }),
    });
    const claims = atrClaimsFromJwtPayload(payload, config);
    yield* Effect.try({
      try: () =>
        assertEmailDomainAllowed(claims, {
          allowedDomains: config.allowedEmailDomains,
          require: config.requireEmailDomain,
        }),
      catch: (cause) => new OidcAuthError({ reason: errorMessage(cause), cause }),
    });
    return { claims, payload };
  });
}

/**
 * Resolve ATR claims from request headers in OIDC mode (Effect form).
 * Fails with {@link OidcAuthError} when the bearer is missing or verification fails.
 */
export function resolveOidcAtrClaimsFromHeadersEffect(
  headers: AuthHeaderSource,
  config: OidcAuthConfig = loadOidcAuthConfig()
): Effect.Effect<AtrClaims, OidcAuthError> {
  const token = extractBearer(headers);
  if (!token) {
    return Effect.fail(new OidcAuthError({ reason: "Missing Bearer JWT (CLAWQL_AUTH_MODE=oidc)" }));
  }
  return verifyOidcBearerTokenEffect(token, config).pipe(Effect.map((r) => r.claims));
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "OIDC JWT verification failed";
}

/**
 * Promise façade over {@link verifyOidcBearerTokenEffect} for forced edges
 * (Express / MCP bridges) that still consume the discriminated-union shape.
 */
export async function verifyOidcBearerToken(
  token: string,
  config: OidcAuthConfig = loadOidcAuthConfig()
): Promise<{ ok: true; claims: AtrClaims; payload: JWTPayload } | { ok: false; error: string }> {
  return Effect.runPromise(
    verifyOidcBearerTokenEffect(token, config).pipe(
      Effect.map((r) => ({ ok: true, claims: r.claims, payload: r.payload }) as const),
      Effect.catchAll((err) => Effect.succeed({ ok: false, error: err.reason } as const))
    )
  );
}

/**
 * Promise façade over {@link resolveOidcAtrClaimsFromHeadersEffect} for forced edges.
 */
export async function resolveOidcAtrClaimsFromHeaders(
  headers: AuthHeaderSource,
  config: OidcAuthConfig = loadOidcAuthConfig()
): Promise<{ ok: true; claims: AtrClaims } | { ok: false; error: string }> {
  return Effect.runPromise(
    resolveOidcAtrClaimsFromHeadersEffect(headers, config).pipe(
      Effect.map((claims) => ({ ok: true, claims }) as const),
      Effect.catchAll((err) => Effect.succeed({ ok: false, error: err.reason } as const))
    )
  );
}

/** Fail-fast when oidc mode is selected but verify keys are missing. */
export function assertOidcConfigReady(config: OidcAuthConfig = loadOidcAuthConfig()): void {
  resolveVerifyKey(config);
}

export function isOidcAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_AUTH_MODE?.trim().toLowerCase();
  return raw === "oidc" || raw === "oauth2" || envFlag("CLAWQL_AUTH_OIDC", env);
}

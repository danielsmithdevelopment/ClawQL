/**
 * OIDC / JWT bearer verification for CLAWQL_AUTH_MODE=oidc.
 * ClawQL consumes tokens issued by the customer IdP — it does not issue them.
 */

import { readFileSync } from "node:fs";
import {
  createRemoteJWKSet,
  importSPKI,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

import type { AtrClaims, AuthHeaderSource } from "./gateway.js";

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

export function loadOidcAuthConfig(env: NodeJS.ProcessEnv = process.env): OidcAuthConfig {
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
    if (Array.isArray(atr.verticals)) {
      claims.verticals = atr.verticals.filter((x): x is string => typeof x === "string");
    }
    if (typeof atr.acr === "string") claims.acr = atr.acr;
    if (Array.isArray(atr.amr)) {
      claims.amr = atr.amr.filter((x): x is string => typeof x === "string");
    }
    return finalizeMfaClaims(claims, payload);
  }

  const subjectClaim = config.subjectClaim ?? "sub";
  const roleClaim = config.roleClaim ?? "role";
  const scopeClaim = config.scopeClaim ?? "scope";
  const tenantClaim = config.tenantClaim ?? "tenant_id";

  const subRaw = readNested(payload, subjectClaim);
  const roleRaw = readNested(payload, roleClaim);
  const scopeRaw = readNested(payload, scopeClaim);
  const tenantRaw = readNested(payload, tenantClaim);

  const claims: AtrClaims = {
    sub: typeof subRaw === "string" && subRaw ? subRaw : "oidc",
    role: typeof roleRaw === "string" && roleRaw ? roleRaw : "operator",
    scope: (() => {
      const s = asStringArray(scopeRaw);
      return s.length > 0 ? s : ["execute", "search", "memory"];
    })(),
  };
  if (typeof tenantRaw === "string" && tenantRaw) claims.tenantId = tenantRaw;
  return finalizeMfaClaims(claims, payload);
}

function finalizeMfaClaims(claims: AtrClaims, payload: JWTPayload): AtrClaims {
  if (!claims.acr && typeof payload.acr === "string") claims.acr = payload.acr;
  if (!claims.amr) {
    const amr = asStringArray(payload.amr);
    if (amr.length > 0) claims.amr = amr;
  }
  return claims;
}

export async function verifyOidcBearerToken(
  token: string,
  config: OidcAuthConfig = loadOidcAuthConfig()
): Promise<{ ok: true; claims: AtrClaims; payload: JWTPayload } | { ok: false; error: string }> {
  try {
    const key = resolveVerifyKey(config);
    const { payload } = await jwtVerify(token, key, {
      ...(config.issuer ? { issuer: config.issuer } : {}),
      ...(config.audience ? { audience: config.audience } : {}),
    });
    return { ok: true, claims: atrClaimsFromJwtPayload(payload, config), payload };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "OIDC JWT verification failed",
    };
  }
}

export async function resolveOidcAtrClaimsFromHeaders(
  headers: AuthHeaderSource,
  config: OidcAuthConfig = loadOidcAuthConfig()
): Promise<{ ok: true; claims: AtrClaims } | { ok: false; error: string }> {
  const token = extractBearer(headers);
  if (!token) {
    return { ok: false, error: "Missing Bearer JWT (CLAWQL_AUTH_MODE=oidc)" };
  }
  const result = await verifyOidcBearerToken(token, config);
  if (!result.ok) return result;
  return { ok: true, claims: result.claims };
}

/** Fail-fast when oidc mode is selected but verify keys are missing. */
export function assertOidcConfigReady(config: OidcAuthConfig = loadOidcAuthConfig()): void {
  resolveVerifyKey(config);
}

export function isOidcAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_AUTH_MODE?.trim().toLowerCase();
  return raw === "oidc" || raw === "oauth2" || envFlag("CLAWQL_AUTH_OIDC", env);
}

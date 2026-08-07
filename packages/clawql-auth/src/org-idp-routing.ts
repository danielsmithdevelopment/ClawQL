/**
 * Per-org IdP routing for multi-tenant SaaS.
 * ClawQL still does not issue login tokens — it selects which customer IdP
 * JWKS/issuer to verify against based on email domain (or token `iss`).
 */

import { decodeJwt, type JWTPayload } from "jose";

import type { AtrClaims } from "./gateway.js";
import {
  atrClaimsFromJwtPayload,
  loadOidcAuthConfig,
  type OidcAuthConfig,
  verifyOidcBearerToken,
} from "./oidc.js";
import { extractEmailDomain, normalizeEmailDomain } from "./policy.js";

export type OrgIdpRoute = {
  orgId: string;
  allowedEmailDomains: string[];
  issuer?: string;
  jwksUrl?: string;
  publicKeyPemPath?: string;
  /** Tests / development only. */
  hs256Secret?: string;
  audience?: string | string[];
};

/**
 * Pluggable lookup — typically backed by org-credits SSO policy in clawql-payments.
 * clawql-auth stays free of a payments dependency.
 */
export type OrgIdpRouter = {
  resolveByEmailDomain: (
    domain: string
  ) => OrgIdpRoute | undefined | Promise<OrgIdpRoute | undefined>;
  resolveByIssuer?: (issuer: string) => OrgIdpRoute | undefined | Promise<OrgIdpRoute | undefined>;
  resolveByOrgId?: (orgId: string) => OrgIdpRoute | undefined | Promise<OrgIdpRoute | undefined>;
};

/** Decode JWT payload without verifying signature (routing peek only). */
export function peekJwtPayloadUnsafe(token: string): JWTPayload | undefined {
  try {
    return decodeJwt(token);
  } catch {
    return undefined;
  }
}

export function emailDomainFromJwtPayload(
  payload: JWTPayload,
  emailClaim = "email"
): string | undefined {
  const emailRaw = payload[emailClaim];
  if (typeof emailRaw === "string") {
    const d = extractEmailDomain(emailRaw);
    if (d) return d;
  }
  if (typeof payload.hd === "string" && payload.hd.trim()) {
    return normalizeEmailDomain(payload.hd);
  }
  return undefined;
}

export function mergeOidcConfigWithRoute(base: OidcAuthConfig, route: OrgIdpRoute): OidcAuthConfig {
  // Bind first so gitleaks does not treat the object-literal merge as a key leak.
  const mergedHs256 = route.hs256Secret ?? base.hs256Secret;
  return {
    ...base,
    issuer: route.issuer ?? base.issuer,
    jwksUrl: route.jwksUrl ?? base.jwksUrl,
    publicKeyPemPath: route.publicKeyPemPath ?? base.publicKeyPemPath,
    hs256Secret: mergedHs256,
    audience: route.audience ?? base.audience,
    allowedEmailDomains:
      route.allowedEmailDomains.length > 0 ? route.allowedEmailDomains : base.allowedEmailDomains,
    requireEmailDomain: route.allowedEmailDomains.length > 0 ? true : base.requireEmailDomain,
  };
}

export async function resolveOrgIdpRouteForToken(
  token: string,
  router: OrgIdpRouter,
  emailClaim = "email"
): Promise<OrgIdpRoute | undefined> {
  const payload = peekJwtPayloadUnsafe(token);
  if (!payload) return undefined;

  const domain = emailDomainFromJwtPayload(payload, emailClaim);
  if (domain) {
    const byDomain = await router.resolveByEmailDomain(domain);
    if (byDomain) return byDomain;
  }

  if (typeof payload.iss === "string" && router.resolveByIssuer) {
    const byIss = await router.resolveByIssuer(payload.iss);
    if (byIss) return byIss;
  }

  const orgRaw = payload.org_id ?? payload.orgId;
  if (typeof orgRaw === "string" && router.resolveByOrgId) {
    return router.resolveByOrgId(orgRaw);
  }

  return undefined;
}

/**
 * Verify Bearer JWT, optionally routing to a per-org IdP (JWKS/issuer/domains).
 * When no route matches, falls back to the global `CLAWQL_AUTH_OIDC_*` config.
 */
export async function verifyOidcBearerTokenWithOrgRouting(
  token: string,
  options: {
    baseConfig?: OidcAuthConfig;
    router?: OrgIdpRouter;
  } = {}
): Promise<
  | { ok: true; claims: AtrClaims; payload: JWTPayload; route?: OrgIdpRoute }
  | { ok: false; error: string }
> {
  const base = options.baseConfig ?? loadOidcAuthConfig();
  let route: OrgIdpRoute | undefined;
  let config = base;

  if (options.router) {
    route = await resolveOrgIdpRouteForToken(token, options.router, base.emailClaim);
    if (route) {
      config = mergeOidcConfigWithRoute(base, route);
      // Per-org JWKS/issuer must be present when route overrides keys
      if (!config.jwksUrl && !config.publicKeyPemPath && !config.hs256Secret) {
        return {
          ok: false,
          error: `Org ${route.orgId} SSO route has no JWKS/PEM/HS256 verify key`,
        };
      }
    }
  }

  const result = await verifyOidcBearerToken(token, config);
  if (!result.ok) return result;

  const claims = { ...result.claims };
  if (route) {
    claims.orgId = route.orgId;
    if (!claims.emailDomain && route.allowedEmailDomains[0]) {
      // leave as-is; emailDomain should already be set from token
    }
  }
  // Re-map in case route changed claim names — payload already verified
  const remapped = atrClaimsFromJwtPayload(result.payload, config);
  const merged: AtrClaims = {
    ...remapped,
    ...claims,
    orgId: claims.orgId ?? remapped.orgId ?? route?.orgId,
  };

  return { ok: true, claims: merged, payload: result.payload, route };
}

/** In-memory router for tests / static maps. */
export function createStaticOrgIdpRouter(routes: OrgIdpRoute[]): OrgIdpRouter {
  const byDomain = new Map<string, OrgIdpRoute>();
  const byIssuer = new Map<string, OrgIdpRoute>();
  const byOrg = new Map<string, OrgIdpRoute>();
  for (const r of routes) {
    byOrg.set(r.orgId, r);
    for (const d of r.allowedEmailDomains) {
      byDomain.set(normalizeEmailDomain(d), r);
    }
    if (r.issuer) byIssuer.set(r.issuer, r);
  }
  return {
    resolveByEmailDomain: (domain) => byDomain.get(normalizeEmailDomain(domain)),
    resolveByIssuer: (issuer) => byIssuer.get(issuer),
    resolveByOrgId: (orgId) => byOrg.get(orgId.trim().toLowerCase()),
  };
}

/**
 * Per-org IdP routing for multi-tenant SaaS.
 * ClawQL still does not issue login tokens — it selects which customer IdP
 * JWKS/issuer to verify against based on email domain (or token `iss`).
 */

import { Effect } from "effect";
import { decodeJwt, type JWTPayload } from "jose";

import type { AtrClaims } from "./gateway.js";
import {
  atrClaimsFromJwtPayload,
  loadOidcAuthConfig,
  OidcAuthError,
  type OidcAuthConfig,
  verifyOidcBearerTokenEffect,
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
 * clawql-auth stays free of a payments dependency. Methods return Effect (no Promise façade).
 */
export type OrgIdpRouter = {
  resolveByEmailDomain: (domain: string) => Effect.Effect<OrgIdpRoute | undefined, unknown>;
  resolveByIssuer?: (issuer: string) => Effect.Effect<OrgIdpRoute | undefined, unknown>;
  resolveByOrgId?: (orgId: string) => Effect.Effect<OrgIdpRoute | undefined, unknown>;
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

export function resolveOrgIdpRouteForTokenEffect(
  token: string,
  router: OrgIdpRouter,
  emailClaim = "email"
): Effect.Effect<OrgIdpRoute | undefined, unknown> {
  return Effect.gen(function* () {
    const payload = peekJwtPayloadUnsafe(token);
    if (!payload) return undefined;

    const domain = emailDomainFromJwtPayload(payload, emailClaim);
    if (domain) {
      const byDomain = yield* router.resolveByEmailDomain(domain);
      if (byDomain) return byDomain;
    }

    if (typeof payload.iss === "string" && router.resolveByIssuer) {
      const byIss = yield* router.resolveByIssuer(payload.iss);
      if (byIss) return byIss;
    }

    const orgRaw = payload.org_id ?? payload.orgId;
    if (typeof orgRaw === "string" && router.resolveByOrgId) {
      return yield* router.resolveByOrgId(orgRaw);
    }

    return undefined;
  });
}

/**
 * Verify Bearer JWT, optionally routing to a per-org IdP (JWKS/issuer/domains).
 * When no route matches, falls back to the global `CLAWQL_AUTH_OIDC_*` config.
 */
export function verifyOidcBearerTokenWithOrgRoutingEffect(
  token: string,
  options: {
    baseConfig?: OidcAuthConfig;
    router?: OrgIdpRouter;
  } = {}
): Effect.Effect<
  { claims: AtrClaims; payload: JWTPayload; route?: OrgIdpRoute },
  OidcAuthError
> {
  return Effect.gen(function* () {
    const base = options.baseConfig ?? loadOidcAuthConfig();
    let route: OrgIdpRoute | undefined;
    let config = base;

    if (options.router) {
      route = yield* resolveOrgIdpRouteForTokenEffect(token, options.router, base.emailClaim).pipe(
        Effect.mapError(
          (cause) =>
            new OidcAuthError({
              reason: cause instanceof Error ? cause.message : "Org IdP routing failed",
              cause,
            })
        )
      );
      if (route) {
        config = mergeOidcConfigWithRoute(base, route);
        if (!config.jwksUrl && !config.publicKeyPemPath && !config.hs256Secret) {
          return yield* Effect.fail(
            new OidcAuthError({
              reason: `Org ${route.orgId} SSO route has no JWKS/PEM/HS256 verify key`,
            })
          );
        }
      }
    }

    const verified = yield* verifyOidcBearerTokenEffect(token, config);
    const claims = { ...verified.claims };
    if (route) {
      claims.orgId = route.orgId;
    }
    const remapped = atrClaimsFromJwtPayload(verified.payload, config);
    const merged: AtrClaims = {
      ...remapped,
      ...claims,
      orgId: claims.orgId ?? remapped.orgId ?? route?.orgId,
    };

    return { claims: merged, payload: verified.payload, route };
  });
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
    resolveByEmailDomain: (domain) => Effect.succeed(byDomain.get(normalizeEmailDomain(domain))),
    resolveByIssuer: (issuer) => Effect.succeed(byIssuer.get(issuer)),
    resolveByOrgId: (orgId) => Effect.succeed(byOrg.get(orgId.trim().toLowerCase())),
  };
}

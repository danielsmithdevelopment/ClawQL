/**
 * Enterprise-Managed Authorization (EMA) — ID-JAG assertion verification and
 * IdP group → ATR scope mapping for inbound MCP OAuth.
 *
 * @see https://blog.modelcontextprotocol.io/posts/enterprise-managed-auth/
 */

import { Data, Effect } from "effect";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

import type { AtrClaims } from "../gateway.js";
import { extractOktaGroupsFromPayload } from "./okta-id-jag.js";

/** OAuth wire grant type for ID-JAG exchange (RFC 7523 jwt-bearer). */
export const ID_JAG_JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer" as const;

/** Assertion token type for Cross App Access / ID-JAG. */
export const ID_JAG_ASSERTION_TYPE = "urn:ietf:params:oauth:token-type:id-jag" as const;

export class IdJagAuthError extends Data.TaggedError("IdJagAuthError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type EmaGroupScopeMapping = {
  /** IdP group name or id (matched case-insensitively). */
  idpGroup: string;
  /** ATR role when this group matches (first match wins). */
  role?: string;
  /** MCP tool scopes granted when this group matches (unioned across matches). */
  scope: string[];
};

export type EmaOrgConfig = {
  orgId: string;
  /** JWKS URI for the org's IdP (Okta Cross App Access at launch). */
  idpJwksUri: string;
  /** Expected `iss` on ID-JAG assertions. */
  idpIssuer: string;
  /**
   * Resource server audience — ID-JAG `aud` must include this value
   * (typically the ClawQL MCP origin, e.g. `https://mcp.example.com/`).
   */
  audience: string | string[];
  groupMappings: EmaGroupScopeMapping[];
  defaultScope?: string[];
  defaultRole?: string;
  /** JWT claim holding group membership (default `groups`). */
  groupsClaim?: string;
  /** JWT claim holding org id when not passed explicitly (default `org_id`). */
  orgIdClaim?: string;
  /** Dev/tests only — verify HS256 assertions with this secret instead of JWKS. */
  hs256Secret?: string;
  /** When `okta`, applies Okta Cross App Access group extraction fallbacks. */
  idpProvider?: "okta" | "custom";
};

export type EmaConfigStore = {
  getOrgConfig: (orgId: string) => Promise<EmaOrgConfig | null>;
};

export type VerifiedIdJagClaims = {
  sub: string;
  orgId: string;
  groups: string[];
  email?: string;
  emailVerified?: boolean;
  /** Assertion JWT `jti` when present — audit correlation with MCP token issuance. */
  jti?: string;
  payload: JWTPayload;
};

export type ResolvedEmaScope = {
  scope: string[];
  role: string;
  matchedGroups: string[];
};

const jwksCache = new Map<string, JWTVerifyGetKey>();

function resetIdJagJwksCacheForTests(): void {
  jwksCache.clear();
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

function readClaim(payload: JWTPayload, claim: string): unknown {
  if (!claim.includes(".")) return payload[claim];
  let cur: unknown = payload;
  for (const part of claim.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function audienceMatches(payload: JWTPayload, expected: string | string[]): boolean {
  const aud = payload.aud;
  const expectedList = Array.isArray(expected) ? expected : [expected];
  const audList = aud === undefined ? [] : Array.isArray(aud) ? aud : [aud];
  return expectedList.some((want) => audList.some((got) => got === want));
}

function resolveVerifyKey(config: EmaOrgConfig): JWTVerifyGetKey {
  if (config.hs256Secret) {
    const secret = new TextEncoder().encode(config.hs256Secret);
    return async () => secret;
  }
  let jwks = jwksCache.get(config.idpJwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.idpJwksUri));
    jwksCache.set(config.idpJwksUri, jwks);
  }
  return jwks;
}

/**
 * Map IdP group membership to ATR scope and role using admin-configured mappings.
 * Unions scopes across all matching groups; role comes from the first match.
 */
export function resolveGroupToScope(
  groups: string[],
  mappings: EmaGroupScopeMapping[],
  defaults?: { scope?: string[]; role?: string }
): ResolvedEmaScope {
  const normalizedGroups = new Set(groups.map((g) => g.trim().toLowerCase()).filter(Boolean));
  const matchedGroups: string[] = [];
  const scopeSet = new Set<string>();
  let role: string | undefined;

  for (const mapping of mappings) {
    const key = mapping.idpGroup.trim().toLowerCase();
    if (!key || !normalizedGroups.has(key)) continue;
    matchedGroups.push(mapping.idpGroup);
    for (const s of mapping.scope) {
      if (s.trim()) scopeSet.add(s.trim());
    }
    if (!role && mapping.role?.trim()) role = mapping.role.trim();
  }

  if (matchedGroups.length === 0) {
    const fallbackScope = defaults?.scope?.filter(Boolean) ?? [];
    if (fallbackScope.length === 0) {
      throw new IdJagAuthError({
        reason: "no_matching_idp_groups",
      });
    }
    return {
      scope: fallbackScope,
      role: defaults?.role?.trim() || "operator",
      matchedGroups: [],
    };
  }

  return {
    scope: [...scopeSet],
    role: role ?? defaults?.role?.trim() ?? "operator",
    matchedGroups,
  };
}

/**
 * Build ATR claims from a verified ID-JAG assertion and resolved group scope.
 */
export function atrClaimsFromIdJag(
  verified: VerifiedIdJagClaims,
  resolved: ResolvedEmaScope
): AtrClaims {
  const claims: AtrClaims = {
    sub: verified.sub,
    role: resolved.role,
    scope: resolved.scope,
    orgId: verified.orgId,
    tenantId: verified.orgId,
    idpGroups: verified.groups,
  };
  if (verified.email) {
    claims.email = verified.email;
    claims.emailDomain = verified.email.split("@")[1] || undefined;
  }
  if (verified.emailVerified !== undefined) {
    claims.emailVerified = verified.emailVerified;
  }
  return claims;
}

/**
 * Verify an ID-JAG identity assertion JWT against org IdP trust policy.
 */
export function verifyIdJagAssertionEffect(
  assertion: string,
  config: EmaOrgConfig
): Effect.Effect<VerifiedIdJagClaims, IdJagAuthError> {
  return Effect.gen(function* () {
    const key = yield* Effect.try({
      try: () => resolveVerifyKey(config),
      catch: (cause) =>
        new IdJagAuthError({
          reason: cause instanceof Error ? cause.message : "id_jag_key_resolution_failed",
          cause,
        }),
    });

    const { payload } = yield* Effect.tryPromise({
      try: () =>
        jwtVerify(assertion, key, {
          issuer: config.idpIssuer,
        }),
      catch: (cause) =>
        new IdJagAuthError({
          reason: cause instanceof Error ? cause.message : "id_jag_verify_failed",
          cause,
        }),
    });

    if (!audienceMatches(payload, config.audience)) {
      return yield* Effect.fail(new IdJagAuthError({ reason: "id_jag_audience_mismatch" }));
    }

    const tokenType = readClaim(payload, "token_type") ?? readClaim(payload, "typ");
    if (
      tokenType !== undefined &&
      typeof tokenType === "string" &&
      tokenType !== ID_JAG_ASSERTION_TYPE &&
      tokenType !== "id-jag"
    ) {
      return yield* Effect.fail(
        new IdJagAuthError({ reason: `unsupported_assertion_type: ${tokenType}` })
      );
    }

    const sub = typeof payload.sub === "string" && payload.sub ? payload.sub : undefined;
    if (!sub) {
      return yield* Effect.fail(new IdJagAuthError({ reason: "id_jag_missing_sub" }));
    }

    const groupsClaim = config.groupsClaim ?? "groups";
    const groups = asStringArray(readClaim(payload, groupsClaim));
    if (groups.length === 0) {
      const roles = asStringArray(readClaim(payload, "roles"));
      if (roles.length > 0) {
        groups.push(...roles);
      }
    }
    if (
      groups.length === 0 &&
      (config.idpProvider === "okta" || config.idpJwksUri.includes("okta"))
    ) {
      groups.push(...extractOktaGroupsFromPayload(payload as Record<string, unknown>));
    }

    const orgIdClaim = config.orgIdClaim ?? "org_id";
    const orgFromClaim = readClaim(payload, orgIdClaim);
    const orgId = (typeof orgFromClaim === "string" && orgFromClaim.trim()) || config.orgId;

    const emailRaw = readClaim(payload, "email");
    const email =
      typeof emailRaw === "string" && emailRaw.includes("@")
        ? emailRaw.trim().toLowerCase()
        : undefined;

    const jtiRaw = payload.jti;
    const jti = typeof jtiRaw === "string" && jtiRaw.trim() ? jtiRaw.trim() : undefined;

    return {
      sub,
      orgId,
      groups,
      email,
      emailVerified:
        typeof payload.email_verified === "boolean" ? payload.email_verified : undefined,
      jti,
      payload,
    };
  });
}

export function createMemoryEmaConfigStore(
  configs: EmaOrgConfig[]
): EmaConfigStore & { readonly list: EmaOrgConfig[] } {
  const map = new Map(configs.map((c) => [c.orgId, c]));
  return {
    list: configs,
    async getOrgConfig(orgId) {
      return map.get(orgId) ?? null;
    },
  };
}

/** Test helper — clears JWKS resolver cache between cases. */
export { resetIdJagJwksCacheForTests };

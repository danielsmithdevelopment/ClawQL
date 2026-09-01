/**
 * Auth0 Cross App Access / ID-JAG trust presets for Enterprise-Managed Authorization.
 *
 * Resource App AS consumers verify finished ID-JAG JWTs from Auth0/Okta enterprise IdPs.
 * OIDC JWKS preset only — SAML→refresh→ID-JAG is handled upstream (Requesting App + IdP).
 *
 * @see https://auth0.com/docs/ai-agents-mcp/cross-app-access
 */

import type { EmaGroupScopeMapping, EmaOrgConfig } from "./id-jag.js";

/** Auth0 custom API identifier used as ID-JAG audience when org config omits one. */
export type Auth0EmaOrgParams = {
  orgId: string;
  /** Auth0 tenant domain, e.g. `acme.us.auth0.com` (no scheme). */
  auth0Domain: string;
  /**
   * Auth0 API identifier / audience for the ClawQL MCP resource
   * (e.g. `https://mcp.example.com/` or custom API id).
   */
  audience: string | string[];
  groupMappings: EmaGroupScopeMapping[];
  defaultScope?: string[];
  defaultRole?: string;
  /**
   * JWT claim for group membership (Auth0 often uses namespaced URIs or `groups`).
   * Default: `https://schemas.auth0.com/groups` then falls back to `groups`.
   */
  groupsClaim?: string;
};

function normalizeAuth0Domain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

/**
 * Build {@link EmaOrgConfig} for Auth0 as Resource App AS (XAA ID-JAG verification).
 *
 * JWKS + issuer follow the tenant's default authorization server (`/oauth/token` docs).
 */
export function buildAuth0EmaOrgConfig(params: Auth0EmaOrgParams): EmaOrgConfig {
  const domain = normalizeAuth0Domain(params.auth0Domain);
  const issuer = `https://${domain}/`;
  const groupsClaim = params.groupsClaim?.trim() || "https://schemas.auth0.com/groups";

  return {
    orgId: params.orgId,
    idpJwksUri: `${issuer}.well-known/jwks.json`,
    idpIssuer: issuer,
    audience: params.audience,
    groupMappings: params.groupMappings,
    defaultScope: params.defaultScope,
    defaultRole: params.defaultRole,
    groupsClaim,
    orgIdClaim: "org_id",
    idpProvider: "custom",
  };
}

/**
 * Extract group membership from Auth0-issued JWT payloads.
 * Checks namespaced groups claim, plain `groups`, and `permissions` (RBAC).
 */
export function extractAuth0GroupsFromPayload(
  payload: Record<string, unknown>,
  groupsClaim = "https://schemas.auth0.com/groups"
): string[] {
  const out = new Set<string>();

  const push = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) out.add(item.trim());
      }
      return;
    }
    if (typeof value === "string" && value.trim()) {
      for (const part of value.split(/[\s,]+/)) {
        if (part.trim()) out.add(part.trim());
      }
    }
  };

  push(payload[groupsClaim]);
  push(payload.groups);
  push(payload.permissions);

  const nested = payload.claims;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const claims = nested as Record<string, unknown>;
    push(claims[groupsClaim]);
    push(claims.groups);
  }

  return [...out];
}

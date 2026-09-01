/**
 * Okta Cross App Access / ID-JAG trust presets for Enterprise-Managed Authorization.
 *
 * OIDC verification preset only — configures IdP JWKS + issuer for finished ID-JAG
 * assertions at the Resource App AS (`exchangeIdJag`). Does not implement the SAML
 * interoperability layer (SAML assertion → OAuth refresh token → ID-JAG); that is
 * handled by Okta/Auth0 and the Requesting App before the assertion reaches ClawQL.
 *
 * @see https://blog.modelcontextprotocol.io/posts/enterprise-managed-auth/
 * @see https://auth0.com/docs/ai-agents-mcp/cross-app-access
 */

import type { EmaGroupScopeMapping, EmaOrgConfig } from "./id-jag.js";

/** Default Okta custom authorization server id when using org-level AS. */
export const OKTA_DEFAULT_AUTH_SERVER = "default" as const;

/** Okta standard groups claim on access tokens / ID-JAG assertions. */
export const OKTA_GROUPS_CLAIM = "groups" as const;

export type OktaEmaOrgParams = {
  orgId: string;
  /** e.g. `acme.okta.com` (no scheme). */
  oktaDomain: string;
  /** Okta authorization server id (default `default`). */
  authorizationServerId?: string;
  /** ClawQL MCP resource origin — ID-JAG `aud` (e.g. `https://mcp.example.com/`). */
  audience: string | string[];
  groupMappings: EmaGroupScopeMapping[];
  defaultScope?: string[];
  defaultRole?: string;
};

function normalizeOktaDomain(oktaDomain: string): string {
  return oktaDomain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

/**
 * Build {@link EmaOrgConfig} for Okta Cross App Access (XAA) ID-JAG verification.
 */
export function buildOktaEmaOrgConfig(params: OktaEmaOrgParams): EmaOrgConfig {
  const domain = normalizeOktaDomain(params.oktaDomain);
  const authServerId = params.authorizationServerId?.trim() || OKTA_DEFAULT_AUTH_SERVER;
  const base = `https://${domain}/oauth2/${authServerId}`;

  return {
    orgId: params.orgId,
    idpJwksUri: `${base}/v1/keys`,
    idpIssuer: base,
    audience: params.audience,
    groupMappings: params.groupMappings,
    defaultScope: params.defaultScope,
    defaultRole: params.defaultRole,
    groupsClaim: OKTA_GROUPS_CLAIM,
    orgIdClaim: "org_id",
    idpProvider: "okta",
  };
}

/**
 * Extract group membership from Okta-issued JWT payloads.
 * Checks standard `groups`, OAuth `scp`-adjacent role lists, and nested `claims.groups`.
 */
export function extractOktaGroupsFromPayload(payload: Record<string, unknown>): string[] {
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

  push(payload.groups);
  push(payload.roles);

  const nested = payload.claims;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    push((nested as Record<string, unknown>).groups);
  }

  return [...out];
}

/**
 * ClawQL as self-hosted EMA IdP — ID-JAG assertion issuer (roadmap scaffold).
 *
 * Phase 1 shipped the *consumer* path (verify IdP assertions, mint MCP tokens).
 * This module is the future *issuer* path for regulated / air-gapped deployments
 * that cannot use Okta Cross App Access but still want Enterprise-Managed Authorization.
 *
 * Layers (sequenced after RS256 AS signing + consumer-side WORM audit):
 *  (A) issueIdJagAssertionEffect — org-controlled RS256 signing, JWKS publish
 *  (B) connector registry — admin-authorized MCP connectors per org
 *  (C) TEE-backed signing via clawql-tee — hardening pass, not a protocol blocker
 *
 * Explicit non-goals: full Okta competitor, human SSO/password IdP, SAML/LDAP server.
 */

import { Data, Effect } from "effect";

import type { EmaGroupScopeMapping } from "./id-jag.js";

export const CLAWQL_ID_JAG_ISSUER_TAG = "clawql/IdJagIssuer" as const;

export class IdJagIssuerError extends Data.TaggedError("IdJagIssuerError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Registered MCP connector authorized once by an org admin (EMA registry). */
export type EmaConnectorRegistration = {
  connectorId: string;
  orgId: string;
  /** ClawQL MCP resource audience (`aud` on issued ID-JAG assertions). */
  audience: string | string[];
  label?: string;
  enabled: boolean;
  createdAt: string;
};

export type IssueIdJagAssertionInput = {
  orgId: string;
  subjectId: string;
  connectorId: string;
  /** IdP group memberships to embed in the assertion (admin-mapped upstream). */
  groups: string[];
  groupMappings: EmaGroupScopeMapping[];
  /** Assertion TTL seconds (default 300). */
  ttlSeconds?: number;
};

export type IssuedIdJagAssertion = {
  assertion: string;
  expiresAt: string;
  jti: string;
};

/**
 * Issue an ID-JAG identity assertion for a subject + connector.
 * Scaffold — returns `not_implemented` until RS256 issuer keys and registry land.
 */
export function issueIdJagAssertionEffect(
  _input: IssueIdJagAssertionInput
): Effect.Effect<IssuedIdJagAssertion, IdJagIssuerError> {
  return Effect.fail(
    new IdJagIssuerError({
      reason: "id_jag_issuer_not_implemented",
    })
  );
}

/**
 * Publish JWKS for org-controlled ID-JAG signing keys (resource servers verify here).
 * Scaffold — pairs with {@link issueIdJagAssertionEffect}.
 */
export function idJagIssuerJwksEffect(
  _orgId: string
): Effect.Effect<{ keys: unknown[] }, IdJagIssuerError> {
  return Effect.fail(
    new IdJagIssuerError({
      reason: "id_jag_issuer_jwks_not_implemented",
    })
  );
}

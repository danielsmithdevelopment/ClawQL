/**
 * ClawQL as self-hosted EMA IdP — ID-JAG assertion issuer.
 *
 * For regulated / air-gapped deployments that cannot use Okta Cross App Access
 * but still want Enterprise-Managed Authorization: org admins authorize connectors
 * once; ClawQL issues ID-JAG assertions that the consumer path (`verifyIdJagAssertionEffect`
 * → `exchangeIdJag`) already understands.
 *
 * Layers:
 *  (A) issueIdJagAssertionEffect + org RS256 keys + JWKS — **shipped**
 *  (B) connector registry — **shipped** (`ema-connector-registry.ts`)
 *  (C) TEE-backed signing via clawql-tee — later hardening, not a protocol blocker
 *
 * Explicit non-goals: full Okta competitor, human SSO/password IdP, SAML/LDAP server.
 */

import { randomBytes } from "node:crypto";
import { Context, Data, Effect, Layer } from "effect";
import { SignJWT, type JWK } from "jose";

import {
  emitAuthEventEffect,
  noopAuthEventSink,
  type AuthEventSink,
} from "../audit/auth-events.js";
import { ID_JAG_ASSERTION_TYPE } from "./id-jag.js";
import type { EmaConnectorRegistry } from "./ema-connector-registry.js";
import type { McpOAuthSigningMaterial } from "./mcp-oauth-signing.js";

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

/** Org-level issuer identity + signing material (RS256 production / HS256 tests). */
export type IdJagIssuerOrgMaterial = {
  orgId: string;
  /** `iss` claim on issued assertions. */
  issuer: string;
  /** Public JWKS URI consumers put in `EmaOrgConfig.idpJwksUri`. */
  jwksUri: string;
  signing: McpOAuthSigningMaterial;
};

export type IssueIdJagAssertionInput = {
  orgId: string;
  subjectId: string;
  connectorId: string;
  /** Group memberships embedded in the assertion (consumer maps → ATR scope). */
  groups: string[];
  email?: string;
  emailVerified?: boolean;
  /** Assertion TTL seconds (default 300). */
  ttlSeconds?: number;
};

export type IssuedIdJagAssertion = {
  assertion: string;
  expiresAt: string;
  jti: string;
  connectorId: string;
  orgId: string;
  audience: string | string[];
};

export type IdJagIssuerDeps = {
  connectors: EmaConnectorRegistry;
  /**
   * Resolve org issuer URI + signing keys.
   * Fail with `unknown_org` / `issuer_not_configured` when the org has no issuer material.
   */
  resolveOrgMaterial: (orgId: string) => Effect.Effect<IdJagIssuerOrgMaterial, IdJagIssuerError>;
  eventSink?: AuthEventSink;
  now?: () => number;
};

function firstAudience(audience: string | string[]): string {
  return Array.isArray(audience) ? audience[0]! : audience;
}

/**
 * Issue an ID-JAG identity assertion for a subject + admin-authorized connector.
 * Scope is *not* resolved here — the consumer maps assertion `groups` via `EmaOrgConfig.groupMappings`.
 */
export function issueIdJagAssertionEffect(
  input: IssueIdJagAssertionInput,
  deps: IdJagIssuerDeps
): Effect.Effect<IssuedIdJagAssertion, IdJagIssuerError> {
  return Effect.gen(function* () {
    const orgId = input.orgId?.trim();
    const subjectId = input.subjectId?.trim();
    const connectorId = input.connectorId?.trim();
    if (!orgId) {
      return yield* Effect.fail(new IdJagIssuerError({ reason: "missing_org_id" }));
    }
    if (!subjectId) {
      return yield* Effect.fail(new IdJagIssuerError({ reason: "missing_subject_id" }));
    }
    if (!connectorId) {
      return yield* Effect.fail(new IdJagIssuerError({ reason: "missing_connector_id" }));
    }
    const groups = input.groups.map((g) => g.trim()).filter(Boolean);
    if (groups.length === 0) {
      return yield* Effect.fail(new IdJagIssuerError({ reason: "missing_groups" }));
    }

    const connector = yield* deps.connectors.get(orgId, connectorId);
    if (!connector) {
      return yield* Effect.fail(new IdJagIssuerError({ reason: "unknown_connector" }));
    }
    if (connector.orgId !== orgId) {
      return yield* Effect.fail(new IdJagIssuerError({ reason: "connector_org_mismatch" }));
    }
    if (!connector.enabled) {
      return yield* Effect.fail(new IdJagIssuerError({ reason: "connector_disabled" }));
    }

    const material = yield* deps.resolveOrgMaterial(orgId);
    if (material.orgId !== orgId) {
      return yield* Effect.fail(new IdJagIssuerError({ reason: "issuer_org_mismatch" }));
    }

    const now = deps.now ?? Date.now;
    const nowMs = now();
    const ttlSeconds = input.ttlSeconds && input.ttlSeconds > 0 ? input.ttlSeconds : 300;
    const expiresAtMs = nowMs + ttlSeconds * 1000;
    const jti = randomBytes(12).toString("hex");
    const audience = connector.audience;

    const claims: Record<string, unknown> = {
      groups,
      org_id: orgId,
      token_type: ID_JAG_ASSERTION_TYPE,
      connector_id: connectorId,
    };
    if (input.email?.trim()) {
      claims.email = input.email.trim().toLowerCase();
    }
    if (input.emailVerified !== undefined) {
      claims.email_verified = input.emailVerified;
    }

    const assertion = yield* Effect.tryPromise({
      try: () =>
        new SignJWT(claims)
          .setProtectedHeader({
            alg: material.signing.algorithm,
            ...(material.signing.keyId ? { kid: material.signing.keyId } : {}),
          })
          .setSubject(subjectId)
          .setIssuer(material.issuer)
          .setAudience(audience)
          .setIssuedAt(Math.floor(nowMs / 1000))
          .setExpirationTime(Math.floor(expiresAtMs / 1000))
          .setJti(jti)
          .sign(material.signing.signKey),
      catch: (cause) => new IdJagIssuerError({ reason: "assertion_sign_failed", cause }),
    });

    const issued: IssuedIdJagAssertion = {
      assertion,
      expiresAt: new Date(expiresAtMs).toISOString(),
      jti,
      connectorId,
      orgId,
      audience,
    };

    const sink = deps.eventSink ?? noopAuthEventSink;
    yield* emitAuthEventEffect(sink, {
      type: "ID_JAG_ASSERTION_ISSUED",
      orgId,
      connectorId,
      subjectId,
      audience: firstAudience(audience),
      groups,
      jti,
      expiresAt: issued.expiresAt,
      timestamp: new Date(nowMs).toISOString(),
    });

    return issued;
  });
}

/**
 * Publish JWKS for org-controlled ID-JAG signing keys (resource servers / consumers verify here).
 */
export function idJagIssuerJwksEffect(
  orgId: string,
  deps: Pick<IdJagIssuerDeps, "resolveOrgMaterial">
): Effect.Effect<{ keys: JWK[] }, IdJagIssuerError> {
  return Effect.gen(function* () {
    const trimmed = orgId?.trim();
    if (!trimmed) {
      return yield* Effect.fail(new IdJagIssuerError({ reason: "missing_org_id" }));
    }
    const material = yield* deps.resolveOrgMaterial(trimmed);
    return material.signing.jwks;
  });
}

export class IdJagIssuerService extends Context.Tag(CLAWQL_ID_JAG_ISSUER_TAG)<
  IdJagIssuerService,
  {
    readonly issueAssertion: (
      input: IssueIdJagAssertionInput
    ) => Effect.Effect<IssuedIdJagAssertion, IdJagIssuerError>;
    readonly jwks: (orgId: string) => Effect.Effect<{ keys: JWK[] }, IdJagIssuerError>;
  }
>() {}

export function createIdJagIssuerService(deps: IdJagIssuerDeps): IdJagIssuerService["Type"] {
  return IdJagIssuerService.of({
    issueAssertion: (input) => issueIdJagAssertionEffect(input, deps),
    jwks: (orgId) => idJagIssuerJwksEffect(orgId, deps),
  });
}

export function createIdJagIssuerLayer(deps: IdJagIssuerDeps): Layer.Layer<IdJagIssuerService> {
  return Layer.succeed(IdJagIssuerService, createIdJagIssuerService(deps));
}

/** Build a fixed single-org material resolver (common for one-tenant ClawQL IdP hosts). */
export function fixedOrgMaterialResolver(
  material: IdJagIssuerOrgMaterial
): IdJagIssuerDeps["resolveOrgMaterial"] {
  return (orgId) => {
    if (orgId.trim() !== material.orgId) {
      return Effect.fail(new IdJagIssuerError({ reason: "unknown_org" }));
    }
    return Effect.succeed(material);
  };
}

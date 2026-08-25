/**
 * Auth event taxonomy for optional WORM / audit sinks.
 * clawql-auth stays free of a clawql-audit dependency — hosts inject a sink.
 *
 * Effect-primary: sinks return `Effect`; {@link emitAuthEventEffect} is the domain API.
 * Absolute host boundaries may `Effect.runPromise(emitAuthEventEffect(...))`.
 */

import { Effect } from "effect";

export type AuthEvent =
  | {
      type: "API_KEY_ISSUED";
      keyId: string;
      orgId?: string;
      teamId?: string;
      subjectId: string;
      role: string;
      scope: string[];
      timestamp: string;
    }
  | {
      type: "API_KEY_USED";
      keyId: string;
      orgId?: string;
      teamId?: string;
      subjectId: string;
      timestamp: string;
    }
  | {
      type: "API_KEY_REVOKED";
      keyId: string;
      orgId?: string;
      teamId?: string;
      timestamp: string;
    }
  | {
      type: "API_KEY_INVALID";
      reason: "not_found" | "revoked" | "expired" | "bad_format" | "hash_mismatch";
      keyId?: string;
      timestamp: string;
    }
  | {
      type: "OAUTH_TOKEN_REFRESHED";
      providerId: string;
      tokenKey: string;
      expiresAt: string;
      timestamp: string;
    }
  | {
      type: "OAUTH_REFRESH_FAILED";
      providerId: string;
      tokenKey: string;
      errorCode: string;
      requiresReauth: boolean;
      timestamp: string;
    }
  | {
      type: "OAUTH_REAUTH_REQUIRED";
      providerId: string;
      tokenKey: string;
      reason: string;
      timestamp: string;
    }
  | {
      type: "OAUTH_AUTHORIZATION_COMPLETED";
      providerId: string;
      scope: string[];
      expiresAt: string;
      timestamp: string;
    }
  | {
      type: "MCP_TOKEN_ISSUED";
      clientId: string;
      grantType: string;
      scope: string[];
      expiresAt: string;
      timestamp: string;
      /** Human subject when issued via EMA / ID-JAG (same as ATR sub). */
      subjectId?: string;
      orgId?: string;
      /** Resolved ATR role when issued via EMA / ID-JAG group mapping. */
      role?: string;
      /** All IdP group claims on the ID-JAG assertion. */
      idpGroups?: string[];
      /** IdP groups that matched admin-configured mappings and drove this scope. */
      matchedIdpGroups?: string[];
      /**
       * ID-JAG assertion `jti` when `grantType` is `id_jag`.
       * Correlates this entry with the matching {@link AuthEvent} `ID_JAG_ASSERTION_ISSUED`.
       */
      idJagJti?: string;
      /** SHA-256 hex of the access JWT — join key for revoke / denylist lookup. */
      accessTokenHash?: string;
    }
  | {
      type: "MCP_TOKEN_REFRESHED";
      clientId: string;
      expiresAt: string;
      timestamp: string;
    }
  | {
      type: "MCP_TOKEN_REVOKED";
      clientId: string;
      reason: string;
      timestamp: string;
      /** Present when an access JWT (not refresh) was revoked via hash denylist. */
      accessTokenHash?: string;
    }
  | {
      type: "MCP_TOKEN_VALIDATION_FAILED";
      reason: string;
      timestamp: string;
    }
  | {
      type: "ID_JAG_ASSERTION_ISSUED";
      orgId: string;
      connectorId: string;
      subjectId: string;
      audience: string;
      groups: string[];
      /** Assertion JWT `jti` — join key with {@link AuthEvent} `MCP_TOKEN_ISSUED.idJagJti`. */
      jti: string;
      expiresAt: string;
      timestamp: string;
    }
  | {
      type: "VAULT_LEASE_ISSUED";
      leaseId: string;
      rolePath: string;
      leaseDurationSec: number;
      timestamp: string;
    }
  | {
      type: "VAULT_LEASE_RENEWED";
      leaseId: string;
      rolePath: string;
      leaseDurationSec: number;
      timestamp: string;
    }
  | {
      type: "DOMAIN_TXT_VERIFIED";
      domain: string;
      timestamp: string;
    };

/** Effect-primary sink — hosts inject WORM / logging without Promise domain APIs. */
export type AuthEventSink = (event: AuthEvent) => Effect.Effect<void, unknown>;

/** No-op sink (tests / hosts that log elsewhere). */
export const noopAuthEventSink: AuthEventSink = () => Effect.void;

/** Append an auth event through the injected sink (no-op when unset). */
export function emitAuthEventEffect(
  sink: AuthEventSink | undefined,
  event: AuthEvent
): Effect.Effect<void> {
  if (!sink) return Effect.void;
  return Effect.gen(function* () {
    const result = sink(event);
    // Effect-primary sinks return Effect; sync push-style test sinks return void.
    if (result != null && Effect.isEffect(result)) {
      yield* result.pipe(Effect.catchAll(() => Effect.void));
    }
  });
}

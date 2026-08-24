/**
 * Auth event taxonomy for optional WORM / audit sinks.
 * clawql-auth stays free of a clawql-audit dependency — hosts inject a sink.
 */

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
    };

export type AuthEventSink = (event: AuthEvent) => void | Promise<void>;

/** No-op sink (tests / hosts that log elsewhere). */
export const noopAuthEventSink: AuthEventSink = () => undefined;

export async function emitAuthEvent(
  sink: AuthEventSink | undefined,
  event: AuthEvent
): Promise<void> {
  if (!sink) return;
  await sink(event);
}

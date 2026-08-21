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

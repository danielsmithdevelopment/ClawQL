import type { Effect } from "effect";

export type StoredOAuthToken = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAtMs: number;
  scope?: string;
  tokenType?: string;
};

/** `tenant:provider:subject` or any stable opaque key. */
export type OAuthTokenKey = string;

/**
 * Host-supplied refresh callback (talks to the upstream IdP token endpoint).
 * Failure is `unknown` — hosts throw/fail with whatever shape their IdP client returns
 * (inspected via {@link oauthErrorCode}), matching pre-Effect behavior.
 */
export type OAuthRefreshFn = (
  key: OAuthTokenKey,
  current: StoredOAuthToken
) => Effect.Effect<StoredOAuthToken, unknown>;

/** Host-injected token persistence (Vault / SecretStore / memory). Effect-primary. */
export type OAuthTokenPersistence = {
  load: (key: OAuthTokenKey) => Effect.Effect<StoredOAuthToken | null, unknown>;
  save: (key: OAuthTokenKey, token: StoredOAuthToken) => Effect.Effect<void, unknown>;
};

/** Default proactive refresh window (60 seconds). */
export const OAUTH_PROACTIVE_REFRESH_MS = 60_000;

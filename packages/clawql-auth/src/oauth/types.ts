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

export type OAuthRefreshFn = (
  key: OAuthTokenKey,
  current: StoredOAuthToken
) => Promise<StoredOAuthToken>;

export type OAuthTokenPersistence = {
  load: (key: OAuthTokenKey) => Promise<StoredOAuthToken | null>;
  save: (key: OAuthTokenKey, token: StoredOAuthToken) => Promise<void>;
};

/** Default proactive refresh window (60 seconds). */
export const OAUTH_PROACTIVE_REFRESH_MS = 60_000;

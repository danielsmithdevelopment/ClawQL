/**
 * Mutex-protected outbound OAuth token store.
 * Concurrent sessions share one in-flight refresh per token key — avoids
 * invalid_grant races on single-use refresh tokens (MCP ecosystem failure mode).
 */

import {
  emitAuthEvent,
  noopAuthEventSink,
  type AuthEventSink,
} from "../audit/auth-events.js";
import { oauthErrorCode, ReauthRequiredError } from "./errors.js";
import {
  OAUTH_PROACTIVE_REFRESH_MS,
  type OAuthRefreshFn,
  type OAuthTokenKey,
  type OAuthTokenPersistence,
  type StoredOAuthToken,
} from "./types.js";

export type OAuthTokenStoreOptions = {
  persistence: OAuthTokenPersistence;
  refresh: OAuthRefreshFn;
  /** Defaults to key segment before first `:` when present. */
  resolveProviderId?: (key: OAuthTokenKey) => string;
  eventSink?: AuthEventSink;
  proactiveRefreshMs?: number;
  now?: () => number;
};

function defaultProviderId(key: OAuthTokenKey): string {
  const i = key.indexOf(":");
  if (i <= 0) return key;
  // tenant:provider:subject → provider is middle, or if two parts provider is first
  const parts = key.split(":");
  if (parts.length >= 3) return parts[1]!;
  return parts[0]!;
}

export class OAuthTokenStore {
  private readonly refreshLock = new Map<OAuthTokenKey, Promise<StoredOAuthToken>>();
  private readonly proactiveRefreshMs: number;
  private readonly now: () => number;
  private readonly eventSink: AuthEventSink;
  private readonly resolveProviderId: (key: OAuthTokenKey) => string;

  constructor(private readonly options: OAuthTokenStoreOptions) {
    this.proactiveRefreshMs = options.proactiveRefreshMs ?? OAUTH_PROACTIVE_REFRESH_MS;
    this.now = options.now ?? Date.now;
    this.eventSink = options.eventSink ?? noopAuthEventSink;
    this.resolveProviderId = options.resolveProviderId ?? defaultProviderId;
  }

  isExpiringSoon(expiresAtMs: number, nowMs = this.now()): boolean {
    return expiresAtMs - nowMs < this.proactiveRefreshMs;
  }

  /**
   * Returns a valid access token, refreshing proactively when within the window.
   * Concurrent callers for the same key share one refresh promise.
   */
  async getValidToken(key: OAuthTokenKey): Promise<StoredOAuthToken> {
    const current = await this.options.persistence.load(key);
    if (!current) {
      const providerId = this.resolveProviderId(key);
      await emitAuthEvent(this.eventSink, {
        type: "OAUTH_REAUTH_REQUIRED",
        providerId,
        tokenKey: key,
        reason: "no_token",
        timestamp: new Date(this.now()).toISOString(),
      });
      throw new ReauthRequiredError({
        tokenKey: key,
        providerId,
        reason: "no_token",
      });
    }

    if (!this.isExpiringSoon(current.expiresAtMs)) {
      return current;
    }

    return this.executeRefresh(key, current);
  }

  /** Mutex-protected refresh — all waiters share the in-flight promise. */
  async executeRefresh(
    key: OAuthTokenKey,
    current: StoredOAuthToken
  ): Promise<StoredOAuthToken> {
    const inflight = this.refreshLock.get(key);
    if (inflight) return inflight;

    const providerId = this.resolveProviderId(key);

    const refreshPromise = (async () => {
      try {
        const next = await this.options.refresh(key, current);
        await this.options.persistence.save(key, next);
        await emitAuthEvent(this.eventSink, {
          type: "OAUTH_TOKEN_REFRESHED",
          providerId,
          tokenKey: key,
          expiresAt: new Date(next.expiresAtMs).toISOString(),
          timestamp: new Date(this.now()).toISOString(),
        });
        return next;
      } catch (err: unknown) {
        const errorCode = oauthErrorCode(err);
        const requiresReauth = errorCode === "invalid_grant";
        await emitAuthEvent(this.eventSink, {
          type: "OAUTH_REFRESH_FAILED",
          providerId,
          tokenKey: key,
          errorCode,
          requiresReauth,
          timestamp: new Date(this.now()).toISOString(),
        });
        if (requiresReauth) {
          await emitAuthEvent(this.eventSink, {
            type: "OAUTH_REAUTH_REQUIRED",
            providerId,
            tokenKey: key,
            reason: "invalid_grant",
            timestamp: new Date(this.now()).toISOString(),
          });
          throw new ReauthRequiredError({
            tokenKey: key,
            providerId,
            reason: "invalid_grant",
          });
        }
        throw err;
      } finally {
        this.refreshLock.delete(key);
      }
    })();

    this.refreshLock.set(key, refreshPromise);
    return refreshPromise;
  }
}

export function createOAuthTokenStore(options: OAuthTokenStoreOptions): OAuthTokenStore {
  return new OAuthTokenStore(options);
}

/** In-memory persistence for tests and single-process demos. */
export function createMemoryOAuthPersistence(): OAuthTokenPersistence & {
  readonly map: Map<OAuthTokenKey, StoredOAuthToken>;
} {
  const map = new Map<OAuthTokenKey, StoredOAuthToken>();
  return {
    map,
    async load(key) {
      return map.get(key) ?? null;
    },
    async save(key, token) {
      map.set(key, token);
    },
  };
}

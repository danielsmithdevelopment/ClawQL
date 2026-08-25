/**
 * Mutex-protected outbound OAuth token store.
 * Concurrent sessions share one in-flight refresh per token key — avoids
 * invalid_grant races on single-use refresh tokens (MCP ecosystem failure mode).
 *
 * Effect-primary: {@link OAuthTokenStoreService} + {@link createOAuthTokenStoreLayer} mirror
 * {@link GatewayAuthService} / {@link IdJagIssuerService}. The in-flight refresh dedup uses a
 * `Map<OAuthTokenKey, Fiber.RuntimeFiber<...>>` — an Effect-native replacement for the
 * `Map<OAuthTokenKey, Promise<...>>` mutex — with `Effect.forkDaemon` + `Fiber.join` so all
 * concurrent waiters share the same underlying refresh fiber.
 */

import { Context, Effect, Fiber, Layer } from "effect";

import {
  emitAuthEventEffect,
  noopAuthEventSink,
  type AuthEvent,
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

function emitEffect(sink: AuthEventSink, event: AuthEvent): Effect.Effect<void> {
  return emitAuthEventEffect(sink, event);
}

export class OAuthTokenStore {
  private readonly refreshLock = new Map<
    OAuthTokenKey,
    Fiber.RuntimeFiber<StoredOAuthToken, unknown>
  >();
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
   * Concurrent callers for the same key share one refresh fiber.
   */
  getValidToken(
    key: OAuthTokenKey
  ): Effect.Effect<StoredOAuthToken, ReauthRequiredError | unknown> {
    return Effect.gen(this, function* () {
      const current = yield* this.options.persistence.load(key);
      if (!current) {
        const providerId = this.resolveProviderId(key);
        yield* emitEffect(this.eventSink, {
          type: "OAUTH_REAUTH_REQUIRED",
          providerId,
          tokenKey: key,
          reason: "no_token",
          timestamp: new Date(this.now()).toISOString(),
        });
        return yield* Effect.fail(
          new ReauthRequiredError({
            tokenKey: key,
            providerId,
            reason: "no_token",
          })
        );
      }

      if (!this.isExpiringSoon(current.expiresAtMs)) {
        return current;
      }

      return yield* this.executeRefresh(key, current);
    });
  }

  /** Mutex-protected refresh — all waiters share the in-flight fiber. */
  executeRefresh(
    key: OAuthTokenKey,
    current: StoredOAuthToken
  ): Effect.Effect<StoredOAuthToken, ReauthRequiredError | unknown> {
    return Effect.gen(this, function* () {
      const inflight = this.refreshLock.get(key);
      if (inflight) return yield* Fiber.join(inflight);

      const providerId = this.resolveProviderId(key);

      const refreshEffect: Effect.Effect<StoredOAuthToken, ReauthRequiredError | unknown> =
        Effect.gen(this, function* () {
          const next = yield* this.options.refresh(key, current);
          yield* this.options.persistence.save(key, next);
          yield* emitEffect(this.eventSink, {
            type: "OAUTH_TOKEN_REFRESHED",
            providerId,
            tokenKey: key,
            expiresAt: new Date(next.expiresAtMs).toISOString(),
            timestamp: new Date(this.now()).toISOString(),
          });
          return next;
        }).pipe(
          Effect.catchAll((err) =>
            Effect.gen(this, function* () {
              const errorCode = oauthErrorCode(err);
              const requiresReauth = errorCode === "invalid_grant";
              yield* emitEffect(this.eventSink, {
                type: "OAUTH_REFRESH_FAILED",
                providerId,
                tokenKey: key,
                errorCode,
                requiresReauth,
                timestamp: new Date(this.now()).toISOString(),
              });
              if (requiresReauth) {
                yield* emitEffect(this.eventSink, {
                  type: "OAUTH_REAUTH_REQUIRED",
                  providerId,
                  tokenKey: key,
                  reason: "invalid_grant",
                  timestamp: new Date(this.now()).toISOString(),
                });
                return yield* Effect.fail(
                  new ReauthRequiredError({
                    tokenKey: key,
                    providerId,
                    reason: "invalid_grant",
                  })
                );
              }
              return yield* Effect.fail(err);
            })
          ),
          Effect.ensuring(Effect.sync(() => this.refreshLock.delete(key)))
        );

      const fiber = yield* Effect.forkDaemon(refreshEffect);
      this.refreshLock.set(key, fiber);
      return yield* Fiber.join(fiber);
    });
  }
}

export function createOAuthTokenStore(options: OAuthTokenStoreOptions): OAuthTokenStore {
  return new OAuthTokenStore(options);
}

export class OAuthTokenStoreService extends Context.Tag("clawql/OAuthTokenStoreService")<
  OAuthTokenStoreService,
  {
    readonly isExpiringSoon: (expiresAtMs: number, nowMs?: number) => boolean;
    readonly getValidToken: (
      key: OAuthTokenKey
    ) => Effect.Effect<StoredOAuthToken, ReauthRequiredError | unknown>;
    readonly executeRefresh: (
      key: OAuthTokenKey,
      current: StoredOAuthToken
    ) => Effect.Effect<StoredOAuthToken, ReauthRequiredError | unknown>;
  }
>() {}

export function oauthTokenStoreServiceFromStore(
  store: OAuthTokenStore
): OAuthTokenStoreService["Type"] {
  return OAuthTokenStoreService.of({
    isExpiringSoon: (expiresAtMs, nowMs) => store.isExpiringSoon(expiresAtMs, nowMs),
    getValidToken: (key) => store.getValidToken(key),
    executeRefresh: (key, current) => store.executeRefresh(key, current),
  });
}

/** Build an isolated OAuth token store service layer (mirrors `createIdJagIssuerLayer`). */
export function createOAuthTokenStoreLayer(
  options: OAuthTokenStoreOptions
): Layer.Layer<OAuthTokenStoreService> {
  return Layer.succeed(
    OAuthTokenStoreService,
    oauthTokenStoreServiceFromStore(createOAuthTokenStore(options))
  );
}

/** In-memory persistence for tests and single-process demos. */
export function createMemoryOAuthPersistence(): OAuthTokenPersistence & {
  readonly map: Map<OAuthTokenKey, StoredOAuthToken>;
} {
  const map = new Map<OAuthTokenKey, StoredOAuthToken>();
  return {
    map,
    load: (key) => Effect.sync(() => map.get(key) ?? null),
    save: (key, token) =>
      Effect.sync(() => {
        map.set(key, token);
      }),
  };
}

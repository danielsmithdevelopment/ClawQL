/**
 * Process-cached remote JWKS getters. jose's createRemoteJWKSet already
 * refetches on unknown kid and rate-limits with cooldownDuration — but only
 * if the same getter is reused. Creating a new one per verify bypasses both.
 */

import {
  createRemoteJWKSet,
  customFetch as joseCustomFetch,
  type JWTVerifyGetKey,
  type RemoteJWKSetOptions,
} from "jose";
import { Context, Effect, Layer } from "effect";

export const DEFAULT_JWKS_TIMEOUT_MS = 2500;
export const DEFAULT_JWKS_COOLDOWN_MS = 30_000;
export const DEFAULT_JWKS_CACHE_MAX_AGE_MS = 600_000;

export type SupabaseJwksCustomFetch = NonNullable<RemoteJWKSetOptions[typeof joseCustomFetch]>;

export type SupabaseJwksCacheOptions = {
  readonly timeoutDuration?: number;
  readonly cooldownDuration?: number;
  readonly cacheMaxAge?: number;
  readonly customFetch?: SupabaseJwksCustomFetch;
};

export class SupabaseJwksCacheService extends Context.Service<
  SupabaseJwksCacheService,
  {
    readonly get: (jwksUrl: string) => Effect.Effect<JWTVerifyGetKey>;
  }
>()("clawql/SupabaseJwksCacheService") {}

export function supabaseJwksCacheLayer(
  options: SupabaseJwksCacheOptions = {}
): Layer.Layer<SupabaseJwksCacheService> {
  return Layer.sync(SupabaseJwksCacheService, () => {
    const getters = new Map<string, JWTVerifyGetKey>();
    const timeoutDuration = options.timeoutDuration ?? DEFAULT_JWKS_TIMEOUT_MS;
    const cooldownDuration = options.cooldownDuration ?? DEFAULT_JWKS_COOLDOWN_MS;
    const cacheMaxAge = options.cacheMaxAge ?? DEFAULT_JWKS_CACHE_MAX_AGE_MS;

    return SupabaseJwksCacheService.of({
      get: (jwksUrl) =>
        Effect.sync(() => {
          const url = jwksUrl.trim();
          const existing = getters.get(url);
          if (existing) return existing;
          const remoteOptions: RemoteJWKSetOptions = {
            timeoutDuration,
            cooldownDuration,
            cacheMaxAge,
          };
          if (options.customFetch) {
            remoteOptions[joseCustomFetch] = options.customFetch;
          }
          const created = createRemoteJWKSet(new URL(url), remoteOptions);
          getters.set(url, created);
          return created;
        }),
    });
  });
}

export const SupabaseJwksCacheServiceLive = supabaseJwksCacheLayer();

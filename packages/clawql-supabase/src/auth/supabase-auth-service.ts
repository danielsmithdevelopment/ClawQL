/**
 * Verify Supabase Auth access tokens (JWKS default, HS256 secret fallback).
 * ClawQL does not issue these tokens — Supabase Auth does.
 */

import { jwtVerify, type JWTPayload, type JWTVerifyGetKey, type JWTVerifyResult } from "jose";
import { Context, Data, Effect, Layer } from "effect";
import {
  SupabaseConfigError,
  SupabaseConfigService,
  SupabaseConfigServiceLive,
  type SupabaseConfig,
} from "../config/supabase-config.js";
import {
  supabaseJwksCacheLayer,
  SupabaseJwksCacheService,
  type SupabaseJwksCacheOptions,
} from "./supabase-jwks-cache.js";
import {
  assertRecentAuthenticationEffect,
  SessionRecencyError,
  sessionAuthenticatedAtSecondsEffect,
  type AssertRecentAuthenticationOptions,
} from "./session-recency.js";

export class SupabaseAuthError extends Data.TaggedError("SupabaseAuthError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type SupabaseSessionClaims = {
  readonly sub: string;
  readonly email: string | undefined;
  readonly role: string | undefined;
  readonly aud: string | string[] | undefined;
  readonly iss: string | undefined;
  readonly exp: number | undefined;
  readonly raw: JWTPayload;
};

export type SupabaseAuthRestResult = {
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly userId: string;
  readonly email: string | undefined;
};

export type VerifyAccessTokenOptions = {
  /**
   * Privileged account plumbing (checkout, deletion). Rejects anonymous-role tokens.
   * Default true — this package is not an agent-facing verifier.
   */
  readonly privileged?: boolean;
};

function stripBearer(token: string): string {
  const t = token.trim();
  return t.toLowerCase().startsWith("bearer ") ? t.slice(7).trim() : t;
}

function isAnonymousRole(role: string | undefined): boolean {
  if (!role) return true;
  const r = role.trim().toLowerCase();
  return r === "anon" || r === "anonymous";
}

const jwtVerifyOptions = (config: SupabaseConfig) => ({
  issuer: config.issuer,
  audience: config.audience,
  clockTolerance: 5,
});

const verifyWithKey = (
  token: string,
  key: JWTVerifyGetKey | Uint8Array,
  config: SupabaseConfig
): Effect.Effect<JWTVerifyResult, SupabaseAuthError> =>
  Effect.tryPromise({
    try: () => jwtVerify(token, key, jwtVerifyOptions(config)),
    catch: (cause) =>
      new SupabaseAuthError({
        reason: cause instanceof Error ? cause.message : "JWT verification failed",
        cause,
      }),
  });

const claimsFromPayload = (
  payload: JWTPayload,
  privileged: boolean
): Effect.Effect<SupabaseSessionClaims, SupabaseAuthError> =>
  Effect.gen(function* () {
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) {
      return yield* Effect.fail(new SupabaseAuthError({ reason: "JWT missing sub" }));
    }
    const role = typeof payload.role === "string" ? payload.role : undefined;
    if (privileged && isAnonymousRole(role)) {
      return yield* Effect.fail(
        new SupabaseAuthError({
          reason: "anonymous-role tokens are not allowed for privileged account operations",
        })
      );
    }
    if (privileged && role && role.trim().toLowerCase() !== "authenticated") {
      return yield* Effect.fail(
        new SupabaseAuthError({
          reason: `JWT role "${role}" is not allowed for privileged account operations`,
        })
      );
    }
    const email =
      typeof payload.email === "string"
        ? payload.email
        : typeof (payload as { user_metadata?: { email?: string } }).user_metadata?.email ===
            "string"
          ? (payload as { user_metadata: { email: string } }).user_metadata.email
          : undefined;

    return {
      sub,
      email,
      role,
      aud: payload.aud,
      iss: typeof payload.iss === "string" ? payload.iss : undefined,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
      raw: payload,
    };
  });

/**
 * JWKS (asymmetric) first when configured; shared HS256 secret only as fallback.
 * JWKS getters are cached per URL (unknown-kid refetch + cooldown live on the getter).
 */
const verifyWithConfig = (
  accessToken: string,
  config: SupabaseConfig,
  jwksCache: Context.Service.Shape<typeof SupabaseJwksCacheService>,
  options: VerifyAccessTokenOptions = {}
): Effect.Effect<SupabaseSessionClaims, SupabaseAuthError> =>
  Effect.gen(function* () {
    const token = stripBearer(accessToken);
    if (!token) {
      return yield* Effect.fail(new SupabaseAuthError({ reason: "access token is empty" }));
    }
    const privileged = options.privileged !== false;

    if (config.jwksUrl) {
      const jwks = yield* jwksCache.get(config.jwksUrl);
      const jwksResult = yield* verifyWithKey(token, jwks, config).pipe(Effect.result);
      if (jwksResult._tag === "Success") {
        return yield* claimsFromPayload(jwksResult.success.payload, privileged);
      }
      if (!config.jwtSecret) {
        return yield* Effect.fail(
          jwksResult.failure ?? new SupabaseAuthError({ reason: "JWKS verification failed" })
        );
      }
    }

    if (config.jwtSecret) {
      const key = new TextEncoder().encode(config.jwtSecret);
      const verified = yield* verifyWithKey(token, key, config);
      return yield* claimsFromPayload(verified.payload, privileged);
    }

    return yield* Effect.fail(
      new SupabaseAuthError({
        reason: "No CLAWQL_SUPABASE_JWKS_URL or CLAWQL_SUPABASE_JWT_SECRET configured",
      })
    );
  });

type AuthRestBody = {
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string; email?: string };
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

const authRestCall = (
  path: string,
  body: Record<string, unknown>,
  config: SupabaseConfig,
  jwksCache: Context.Service.Shape<typeof SupabaseJwksCacheService>
): Effect.Effect<SupabaseAuthRestResult, SupabaseAuthError | SupabaseConfigError> =>
  Effect.gen(function* () {
    if (!config.url) {
      return yield* Effect.fail(
        new SupabaseConfigError({ reason: "CLAWQL_SUPABASE_URL is required" })
      );
    }
    if (!config.anonKey) {
      return yield* Effect.fail(
        new SupabaseConfigError({ reason: "CLAWQL_SUPABASE_ANON_KEY is required for Auth REST" })
      );
    }
    const base = config.url.replace(/\/$/, "");
    const res = yield* Effect.tryPromise({
      try: () =>
        fetch(`${base}/auth/v1${path}`, {
          method: "POST",
          headers: {
            apikey: config.anonKey!,
            Authorization: `Bearer ${config.anonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      catch: (cause) =>
        new SupabaseAuthError({
          reason: "Supabase Auth REST network error",
          cause,
        }),
    });
    const json = yield* Effect.tryPromise({
      try: () => res.json() as Promise<AuthRestBody>,
      catch: (cause) => new SupabaseAuthError({ reason: "Invalid JSON from Supabase Auth", cause }),
    });
    if (!res.ok) {
      const reason =
        json.error_description ||
        json.msg ||
        json.message ||
        json.error ||
        `Supabase Auth HTTP ${res.status}`;
      return yield* Effect.fail(new SupabaseAuthError({ reason }));
    }
    const accessToken = json.access_token?.trim();
    if (!accessToken) {
      return yield* Effect.fail(
        new SupabaseAuthError({ reason: "Supabase Auth response missing access_token" })
      );
    }
    const userId = json.user?.id?.trim();
    if (!userId) {
      const claims = yield* verifyWithConfig(accessToken, config, jwksCache);
      return {
        accessToken,
        refreshToken: json.refresh_token,
        userId: claims.sub,
        email: claims.email ?? json.user?.email,
      };
    }
    return {
      accessToken,
      refreshToken: json.refresh_token,
      userId,
      email: json.user?.email,
    };
  });

const deleteAuthUserWithConfig = (
  supabaseUserId: string,
  config: SupabaseConfig
): Effect.Effect<void, SupabaseAuthError | SupabaseConfigError> =>
  Effect.gen(function* () {
    const id = supabaseUserId.trim();
    if (!id) {
      return yield* Effect.fail(new SupabaseAuthError({ reason: "supabase user id is empty" }));
    }
    if (!config.url) {
      return yield* Effect.fail(
        new SupabaseConfigError({ reason: "CLAWQL_SUPABASE_URL is required" })
      );
    }
    if (!config.serviceRoleKey) {
      return yield* Effect.fail(
        new SupabaseConfigError({
          reason: "CLAWQL_SUPABASE_SERVICE_ROLE_KEY is required to delete Auth users",
        })
      );
    }
    const base = config.url.replace(/\/$/, "");
    const res = yield* Effect.tryPromise({
      try: () =>
        fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: {
            apikey: config.serviceRoleKey!,
            Authorization: `Bearer ${config.serviceRoleKey}`,
          },
        }),
      catch: (cause) =>
        new SupabaseAuthError({
          reason: "Supabase Auth admin delete network error",
          cause,
        }),
    });
    if (!res.ok && res.status !== 404) {
      const text = yield* Effect.promise(() => res.text().catch(() => ""));
      return yield* Effect.fail(
        new SupabaseAuthError({
          reason: `Supabase Auth admin delete HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
        })
      );
    }
  });

export class SupabaseAuthService extends Context.Service<
  SupabaseAuthService,
  {
    readonly verifyAccessToken: (
      accessToken: string,
      env?: NodeJS.ProcessEnv,
      options?: VerifyAccessTokenOptions
    ) => Effect.Effect<SupabaseSessionClaims, SupabaseAuthError | SupabaseConfigError>;
    readonly signUpWithPassword: (
      input: { email: string; password: string },
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<SupabaseAuthRestResult, SupabaseAuthError | SupabaseConfigError>;
    readonly signInWithPassword: (
      input: { email: string; password: string },
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<SupabaseAuthRestResult, SupabaseAuthError | SupabaseConfigError>;
    readonly deleteAuthUser: (
      supabaseUserId: string,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<void, SupabaseAuthError | SupabaseConfigError>;
    readonly sessionAuthenticatedAtSeconds: (
      claims: SupabaseSessionClaims
    ) => Effect.Effect<number | undefined>;
    readonly assertRecentAuthentication: (
      claims: SupabaseSessionClaims,
      options?: AssertRecentAuthenticationOptions
    ) => Effect.Effect<void, SessionRecencyError>;
  }
>()("clawql/SupabaseAuthService") {}

const SupabaseAuthServiceLiveInner = Layer.effect(
  SupabaseAuthService,
  Effect.gen(function* () {
    const configSvc = yield* SupabaseConfigService;
    const jwksCache = yield* SupabaseJwksCacheService;
    return SupabaseAuthService.of({
      verifyAccessToken: (accessToken, env, options) =>
        Effect.gen(function* () {
          const config = yield* configSvc.requireConfigured(env);
          return yield* verifyWithConfig(accessToken, config, jwksCache, options);
        }),
      signUpWithPassword: (input, env) =>
        Effect.gen(function* () {
          const config = yield* configSvc.requireConfigured(env);
          return yield* authRestCall(
            "/signup",
            { email: input.email.trim(), password: input.password },
            config,
            jwksCache
          );
        }),
      signInWithPassword: (input, env) =>
        Effect.gen(function* () {
          const config = yield* configSvc.requireConfigured(env);
          return yield* authRestCall(
            "/token?grant_type=password",
            { email: input.email.trim(), password: input.password },
            config,
            jwksCache
          );
        }),
      deleteAuthUser: (supabaseUserId, env) =>
        Effect.gen(function* () {
          const config = yield* configSvc.requireConfigured(env);
          return yield* deleteAuthUserWithConfig(supabaseUserId, config);
        }),
      sessionAuthenticatedAtSeconds: (claims) => sessionAuthenticatedAtSecondsEffect(claims),
      assertRecentAuthentication: (claims, options) =>
        assertRecentAuthenticationEffect(claims, options),
    });
  })
);

export function supabaseAuthServiceLayer(
  jwksOptions?: SupabaseJwksCacheOptions
): Layer.Layer<SupabaseAuthService> {
  return SupabaseAuthServiceLiveInner.pipe(
    Layer.provide(Layer.merge(SupabaseConfigServiceLive, supabaseJwksCacheLayer(jwksOptions ?? {})))
  );
}

export const SupabaseAuthServiceLive = supabaseAuthServiceLayer();

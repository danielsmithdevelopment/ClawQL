/**
 * Verify Supabase Auth access tokens (HS256 JWT secret or JWKS).
 * ClawQL does not issue these tokens — Supabase Auth does.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { Context, Data, Effect, Layer } from "effect";
import {
  SupabaseConfigError,
  SupabaseConfigService,
  SupabaseConfigServiceLive,
  type SupabaseConfig,
} from "../config/supabase-config.js";

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
  readonly raw: JWTPayload;
};

export type SupabaseAuthRestResult = {
  readonly accessToken: string;
  readonly refreshToken: string | undefined;
  readonly userId: string;
  readonly email: string | undefined;
};

function stripBearer(token: string): string {
  const t = token.trim();
  return t.toLowerCase().startsWith("bearer ") ? t.slice(7).trim() : t;
}

const verifyWithConfig = (
  accessToken: string,
  config: SupabaseConfig
): Effect.Effect<SupabaseSessionClaims, SupabaseAuthError> =>
  Effect.gen(function* () {
    const token = stripBearer(accessToken);
    if (!token) {
      return yield* Effect.fail(new SupabaseAuthError({ reason: "access token is empty" }));
    }

    let key: JWTVerifyGetKey | Uint8Array;
    if (config.jwtSecret) {
      key = new TextEncoder().encode(config.jwtSecret);
    } else if (config.jwksUrl) {
      key = createRemoteJWKSet(new URL(config.jwksUrl));
    } else {
      return yield* Effect.fail(
        new SupabaseAuthError({
          reason: "No CLAWQL_SUPABASE_JWT_SECRET or JWKS URL configured",
        })
      );
    }

    const verified = yield* Effect.tryPromise({
      try: () =>
        jwtVerify(token, key, {
          issuer: config.issuer,
          audience: config.audience,
        }),
      catch: (cause) =>
        new SupabaseAuthError({
          reason: cause instanceof Error ? cause.message : "JWT verification failed",
          cause,
        }),
    });

    const payload = verified.payload;
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) {
      return yield* Effect.fail(new SupabaseAuthError({ reason: "JWT missing sub" }));
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
      role: typeof payload.role === "string" ? payload.role : undefined,
      aud: payload.aud,
      iss: typeof payload.iss === "string" ? payload.iss : undefined,
      raw: payload,
    };
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
  config: SupabaseConfig
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
      catch: (cause) =>
        new SupabaseAuthError({ reason: "Invalid JSON from Supabase Auth", cause }),
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
      const claims = yield* verifyWithConfig(accessToken, config);
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

export class SupabaseAuthService extends Context.Service<
  SupabaseAuthService,
  {
    readonly verifyAccessToken: (
      accessToken: string,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<SupabaseSessionClaims, SupabaseAuthError | SupabaseConfigError>;
    readonly signUpWithPassword: (
      input: { email: string; password: string },
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<SupabaseAuthRestResult, SupabaseAuthError | SupabaseConfigError>;
    readonly signInWithPassword: (
      input: { email: string; password: string },
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<SupabaseAuthRestResult, SupabaseAuthError | SupabaseConfigError>;
  }
>()("clawql/SupabaseAuthService") {}

const SupabaseAuthServiceLiveInner = Layer.effect(
  SupabaseAuthService,
  Effect.gen(function* () {
    const configSvc = yield* SupabaseConfigService;
    return SupabaseAuthService.of({
      verifyAccessToken: (accessToken, env) =>
        Effect.gen(function* () {
          const config = yield* configSvc.requireConfigured(env);
          return yield* verifyWithConfig(accessToken, config);
        }),
      signUpWithPassword: (input, env) =>
        Effect.gen(function* () {
          const config = yield* configSvc.requireConfigured(env);
          return yield* authRestCall(
            "/signup",
            { email: input.email.trim(), password: input.password },
            config
          );
        }),
      signInWithPassword: (input, env) =>
        Effect.gen(function* () {
          const config = yield* configSvc.requireConfigured(env);
          return yield* authRestCall(
            "/token?grant_type=password",
            { email: input.email.trim(), password: input.password },
            config
          );
        }),
    });
  })
);

export const SupabaseAuthServiceLive = SupabaseAuthServiceLiveInner.pipe(
  Layer.provide(SupabaseConfigServiceLive)
);

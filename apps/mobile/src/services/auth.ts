/**
 * Browser-based sign-in with app / universal link return — no localhost.
 * Fixture / reviewer-demo paths support Maestro + App Store review without IdP.
 */
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Context, Data, Effect, Layer } from "effect";

import {
  FIXTURE_SESSION,
  REVIEWER_DEMO_SESSION,
} from "../domain/fixtures";
import type { MobileSession } from "../domain/schemas";
import { resetFixtureStateEffect } from "./api";
import { loadMobileConfigEffect } from "./config";
import { clearOfflineSnapshotEffect } from "./offline-cache";
import { clearSessionEffect, saveSessionEffect } from "./session-store";

WebBrowser.maybeCompleteAuthSession();

export class MobileAuthError extends Data.TaggedError("MobileAuthError")<{
  readonly reason: string;
}> {}

export function buildAuthRedirectUriEffect(): Effect.Effect<string> {
  return Effect.sync(() =>
    AuthSession.makeRedirectUri({
      scheme: "clawql",
      path: "auth/callback",
    })
  );
}

export function buildAuthorizeUrlEffect(
  redirectUri: string
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    const url = new URL(`${config.authIssuer}/auth/mobile/start`);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("client_id", "clawql-mobile");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile email offline_access");
    return url.toString();
  });
}

/**
 * Opens the system browser for OAuth / IdP. Returns to clawql:// or https://cloud.clawql.com/app/…
 * In fixture mode, does not hit the network.
 */
export function signInWithBrowserEffect(): Effect.Effect<
  MobileSession,
  MobileAuthError
> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode) {
      const session = config.reviewerBiometricDemo
        ? REVIEWER_DEMO_SESSION
        : FIXTURE_SESSION;
      yield* saveSessionEffect(session).pipe(
        Effect.mapError(
          (e) => new MobileAuthError({ reason: e.reason })
        )
      );
      return session;
    }

    const redirectUri = yield* buildAuthRedirectUriEffect();
    const authorizeUrl = yield* buildAuthorizeUrlEffect(redirectUri);

    const result = yield* Effect.tryPromise({
      try: () =>
        WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri, {
          preferEphemeralSession: true,
          showInRecents: true,
        }),
      catch: (cause) =>
        new MobileAuthError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });

    if (result.type !== "success" || !result.url) {
      return yield* Effect.fail(
        new MobileAuthError({ reason: `auth_dismissed:${result.type}` })
      );
    }

    const session = yield* exchangeCallbackUrlEffect(result.url).pipe(
      Effect.mapError((e) => new MobileAuthError({ reason: e.reason }))
    );
    yield* saveSessionEffect(session).pipe(
      Effect.mapError((e) => new MobileAuthError({ reason: e.reason }))
    );
    return session;
  });
}

export function signInAsReviewerDemoEffect(): Effect.Effect<
  MobileSession,
  MobileAuthError
> {
  return Effect.gen(function* () {
    yield* resetFixtureStateEffect();
    const session = { ...REVIEWER_DEMO_SESSION, expiresAtMs: Date.now() + 86_400_000 };
    yield* saveSessionEffect(session).pipe(
      Effect.mapError((e) => new MobileAuthError({ reason: e.reason }))
    );
    return session;
  });
}

export function signInAsFixtureEffect(): Effect.Effect<
  MobileSession,
  MobileAuthError
> {
  return Effect.gen(function* () {
    yield* resetFixtureStateEffect();
    const session = { ...FIXTURE_SESSION, expiresAtMs: Date.now() + 86_400_000 };
    yield* saveSessionEffect(session).pipe(
      Effect.mapError((e) => new MobileAuthError({ reason: e.reason }))
    );
    return session;
  });
}

export function exchangeCallbackUrlEffect(
  callbackUrl: string
): Effect.Effect<MobileSession, MobileAuthError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    let parsed: URL;
    try {
      parsed = new URL(callbackUrl);
    } catch {
      return yield* Effect.fail(
        new MobileAuthError({ reason: "invalid_callback_url" })
      );
    }

    const code = parsed.searchParams.get("code");
    const accessToken = parsed.searchParams.get("access_token");
    if (accessToken) {
      return {
        accessToken,
        refreshToken: parsed.searchParams.get("refresh_token") ?? undefined,
        userId: parsed.searchParams.get("user_id") ?? "unknown",
        email: parsed.searchParams.get("email") ?? "",
        displayName: parsed.searchParams.get("name") ?? "ClawQL user",
        role: parsed.searchParams.get("role") ?? "member",
        orgId: parsed.searchParams.get("org_id") ?? "",
        reviewerDemo: parsed.searchParams.get("reviewer_demo") === "1",
        expiresAtMs: Date.now() + 3_600_000,
      };
    }
    if (!code) {
      return yield* Effect.fail(
        new MobileAuthError({ reason: "missing_code" })
      );
    }

    const redirectUri = yield* buildAuthRedirectUriEffect();
    const tokenRes = yield* Effect.tryPromise({
      try: async () => {
        const res = await fetch(`${config.authIssuer}/auth/mobile/token`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: "clawql-mobile",
          }),
        });
        if (!res.ok) {
          throw new Error(`token_http_${res.status}`);
        }
        return (await res.json()) as Record<string, unknown>;
      },
      catch: (cause) =>
        new MobileAuthError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });

    const token = String(tokenRes.access_token ?? "");
    if (!token) {
      return yield* Effect.fail(
        new MobileAuthError({ reason: "missing_access_token" })
      );
    }
    return {
      accessToken: token,
      refreshToken:
        typeof tokenRes.refresh_token === "string"
          ? tokenRes.refresh_token
          : undefined,
      userId: String(tokenRes.user_id ?? tokenRes.sub ?? "unknown"),
      email: String(tokenRes.email ?? ""),
      displayName: String(tokenRes.name ?? tokenRes.email ?? "ClawQL user"),
      role: String(tokenRes.role ?? "member"),
      orgId: String(tokenRes.org_id ?? ""),
      reviewerDemo: tokenRes.reviewer_demo === true,
      expiresAtMs:
        Date.now() +
        (typeof tokenRes.expires_in === "number"
          ? tokenRes.expires_in * 1000
          : 3_600_000),
    };
  });
}

export function signOutEffect(): Effect.Effect<void, MobileAuthError> {
  return Effect.gen(function* () {
    yield* clearOfflineSnapshotEffect().pipe(Effect.catch(() => Effect.void));
    yield* clearSessionEffect().pipe(
      Effect.mapError((e) => new MobileAuthError({ reason: e.reason }))
    );
  });
}

function isFixtureAccessToken(token: string): boolean {
  return token.startsWith("fixture-");
}

/** True when access token should be treated as expired (optional skew for refresh-early). */
export function isSessionExpiredEffect(
  session: MobileSession,
  skewMs = 0
): Effect.Effect<boolean> {
  return Effect.sync(() => session.expiresAtMs <= Date.now() + skewMs);
}

/**
 * Refresh access token. Fixture / reviewer-demo extends expiry locally.
 * Live: refresh_token grant against auth issuer.
 */
export function refreshSessionEffect(
  session: MobileSession
): Effect.Effect<MobileSession, MobileAuthError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || isFixtureAccessToken(session.accessToken)) {
      const next: MobileSession = {
        ...session,
        accessToken: session.accessToken.startsWith("fixture-")
          ? `fixture-access-token-${Date.now().toString(36)}`
          : session.accessToken,
        expiresAtMs: Date.now() + 86_400_000,
      };
      yield* saveSessionEffect(next).pipe(
        Effect.mapError((e) => new MobileAuthError({ reason: e.reason }))
      );
      return next;
    }

    if (!session.refreshToken) {
      return yield* Effect.fail(new MobileAuthError({ reason: "no_refresh_token" }));
    }

    const tokenRes = yield* Effect.tryPromise({
      try: async () => {
        const res = await fetch(`${config.authIssuer}/auth/mobile/token`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: session.refreshToken,
            client_id: "clawql-mobile",
          }),
        });
        if (!res.ok) throw new Error(`refresh_http_${res.status}`);
        return (await res.json()) as Record<string, unknown>;
      },
      catch: (cause) =>
        new MobileAuthError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });

    const accessToken = String(tokenRes.access_token ?? "");
    if (!accessToken) {
      return yield* Effect.fail(
        new MobileAuthError({ reason: "missing_access_token" })
      );
    }
    const next: MobileSession = {
      ...session,
      accessToken,
      refreshToken:
        typeof tokenRes.refresh_token === "string"
          ? tokenRes.refresh_token
          : session.refreshToken,
      expiresAtMs:
        Date.now() +
        (typeof tokenRes.expires_in === "number"
          ? tokenRes.expires_in * 1000
          : 3_600_000),
    };
    yield* saveSessionEffect(next).pipe(
      Effect.mapError((e) => new MobileAuthError({ reason: e.reason }))
    );
    return next;
  });
}

/**
 * Return a still-valid session, refreshing when within skew of expiry.
 * Returns null when refresh fails or the session cannot be renewed (caller signs out).
 */
export function ensureFreshSessionEffect(
  session: MobileSession,
  skewMs = 60_000
): Effect.Effect<MobileSession | null, MobileAuthError> {
  return Effect.gen(function* () {
    const expired = yield* isSessionExpiredEffect(session, skewMs);
    if (!expired) return session;
    const refreshed = yield* refreshSessionEffect(session).pipe(
      Effect.map((s) => s as MobileSession | null),
      Effect.catch(() => Effect.succeed(null as MobileSession | null))
    );
    return refreshed;
  });
}

export const CLAWQL_MOBILE_AUTH_TAG = "clawql/MobileAuth" as const;

export class MobileAuth extends Context.Service<
  typeof CLAWQL_MOBILE_AUTH_TAG,
  {
    readonly signInWithBrowser: () => Effect.Effect<MobileSession, MobileAuthError>;
    readonly signInAsFixture: () => Effect.Effect<MobileSession, MobileAuthError>;
    readonly signInAsReviewerDemo: () => Effect.Effect<MobileSession, MobileAuthError>;
    readonly signOut: () => Effect.Effect<void, MobileAuthError>;
    readonly exchangeCallbackUrl: (
      url: string
    ) => Effect.Effect<MobileSession, MobileAuthError>;
    readonly refreshSession: (
      session: MobileSession
    ) => Effect.Effect<MobileSession, MobileAuthError>;
    readonly ensureFreshSession: (
      session: MobileSession,
      skewMs?: number
    ) => Effect.Effect<MobileSession | null, MobileAuthError>;
    readonly isSessionExpired: (
      session: MobileSession,
      skewMs?: number
    ) => Effect.Effect<boolean>;
  }
>()(CLAWQL_MOBILE_AUTH_TAG) {}

export const MobileAuthLive = Layer.succeed(MobileAuth, {
  signInWithBrowser: signInWithBrowserEffect,
  signInAsFixture: signInAsFixtureEffect,
  signInAsReviewerDemo: signInAsReviewerDemoEffect,
  signOut: signOutEffect,
  exchangeCallbackUrl: exchangeCallbackUrlEffect,
  refreshSession: refreshSessionEffect,
  ensureFreshSession: ensureFreshSessionEffect,
  isSessionExpired: isSessionExpiredEffect,
});

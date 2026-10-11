/**
 * Privileged account operations (deletion) require a recent authentication
 * event — a hours-old access token is not enough to irreversibly delete.
 */

import { Data, Effect } from "effect";
import type { JWTPayload } from "jose";

export const DEFAULT_ACCOUNT_DELETE_MAX_AUTH_AGE_SECONDS = 300;

export class SessionRecencyError extends Data.TaggedError("SessionRecencyError")<{
  readonly reason: string;
}> {}

const finiteUnixSeconds = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
};

/** Latest authentication time from amr[].timestamp, else auth_time, else iat. */
export const sessionAuthenticatedAtSecondsEffect = (claims: {
  readonly raw: JWTPayload;
}): Effect.Effect<number | undefined> =>
  Effect.sync(() => {
    const raw = claims.raw;
    const amrTimes: number[] = [];
    if (Array.isArray(raw.amr)) {
      for (const entry of raw.amr) {
        if (entry && typeof entry === "object" && "timestamp" in entry) {
          const ts = finiteUnixSeconds((entry as { timestamp: unknown }).timestamp);
          if (ts !== undefined) amrTimes.push(ts);
        }
      }
    }
    if (amrTimes.length > 0) return Math.max(...amrTimes);
    const authTime = finiteUnixSeconds(raw.auth_time);
    if (authTime !== undefined) return authTime;
    return finiteUnixSeconds(raw.iat);
  });

export const loadAccountDeleteMaxAuthAgeSecondsEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<number> =>
  Effect.sync(() => {
    const raw = env.CLAWQL_ACCOUNT_DELETE_MAX_AUTH_AGE_SECONDS?.trim();
    if (!raw) return DEFAULT_ACCOUNT_DELETE_MAX_AUTH_AGE_SECONDS;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0
      ? Math.floor(n)
      : DEFAULT_ACCOUNT_DELETE_MAX_AUTH_AGE_SECONDS;
  });

export type AssertRecentAuthenticationOptions = {
  readonly maxAgeSeconds?: number;
  readonly nowSeconds?: number;
  readonly env?: NodeJS.ProcessEnv;
};

/**
 * Fail closed when the session has no authentication time, or when the last
 * sign-in is older than maxAgeSeconds (default 5 minutes).
 */
export const assertRecentAuthenticationEffect = (
  claims: { readonly raw: JWTPayload },
  options: AssertRecentAuthenticationOptions = {}
): Effect.Effect<void, SessionRecencyError> =>
  Effect.gen(function* () {
    const maxAge =
      options.maxAgeSeconds ?? (yield* loadAccountDeleteMaxAuthAgeSecondsEffect(options.env));
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const at = yield* sessionAuthenticatedAtSecondsEffect(claims);
    if (at === undefined) {
      return yield* Effect.fail(
        new SessionRecencyError({
          reason: "reauthentication required: session has no authentication time",
        })
      );
    }
    if (now - at > maxAge) {
      return yield* Effect.fail(
        new SessionRecencyError({
          reason: "reauthentication required: sign-in is too old for account deletion",
        })
      );
    }
  });

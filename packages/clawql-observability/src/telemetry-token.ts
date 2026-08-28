import { Effect } from "effect";

import { ObservabilityError } from "./errors.js";
import { signTelemetryJwtRaw, type TelemetryJwtClaims } from "./jwt-hs256.js";

export type { TelemetryJwtClaims } from "./jwt-hs256.js";
export { verifyTelemetryJwt } from "./jwt-hs256.js";

export interface SignTelemetryJwtInput {
  readonly claims: Omit<TelemetryJwtClaims, "iat" | "exp">;
  readonly signingKey: string;
  /** Token lifetime in seconds (default 3600). */
  readonly ttlSeconds?: number;
  readonly now?: () => number;
}

/** Mint an ephemeral HS256 telemetry JWT for browser Faro ingest (backend-only). */
export const signTelemetryJwtEffect = (
  input: SignTelemetryJwtInput
): Effect.Effect<{ token: string; expiresAt: number }, ObservabilityError> =>
  Effect.gen(function* () {
    const nowFn = input.now ?? (() => Math.floor(Date.now() / 1000));
    const iat = nowFn();
    const ttl = input.ttlSeconds ?? 3600;
    const claims: TelemetryJwtClaims = {
      ...input.claims,
      iat,
      exp: iat + ttl,
    };

    const token = yield* Effect.tryPromise({
      try: () => signTelemetryJwtRaw(claims, input.signingKey),
      catch: (cause) => new ObservabilityError({ reason: "telemetry_jwt_sign_failed", cause }),
    });
    return { token, expiresAt: claims.exp };
  });

export const signTelemetryJwt = (
  input: SignTelemetryJwtInput
): Promise<{ token: string; expiresAt: number }> => Effect.runPromise(signTelemetryJwtEffect(input));

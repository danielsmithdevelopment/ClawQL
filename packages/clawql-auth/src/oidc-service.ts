/**
 * Effect service wrapping OIDC / JWT bearer verification.
 * ClawQL consumes IdP-issued tokens — it does not issue them.
 */

import { Context, Effect, Layer } from "effect";
import {
  loadOidcAuthConfig,
  resolveOidcAtrClaimsFromHeadersEffect,
  verifyOidcBearerTokenEffect,
  type OidcAuthConfig,
  type OidcAuthError,
} from "./oidc.js";
import type { AtrClaims, AuthHeaderSource } from "./gateway.js";

export class OidcAuthService extends Context.Tag("clawql/OidcAuthService")<
  OidcAuthService,
  {
    /** Verify a bearer token and map it to ATR claims. */
    readonly verifyBearerToken: (token: string) => Effect.Effect<AtrClaims, OidcAuthError>;
    /**
     * Resolve ATR claims from request headers.
     * Yields `undefined` when no bearer is present; fails on verification errors.
     */
    readonly resolveClaimsFromHeaders: (
      headers: AuthHeaderSource
    ) => Effect.Effect<AtrClaims | undefined, OidcAuthError>;
  }
>() {}

export function oidcAuthServiceFromConfig(config: OidcAuthConfig) {
  return OidcAuthService.of({
    verifyBearerToken: (token) => verifyBearerTokenEffect(token, config),
    resolveClaimsFromHeaders: (headers) =>
      resolveOidcAtrClaimsFromHeadersEffect(headers, config).pipe(
        Effect.catchTag("OidcAuthError", (err) =>
          err.reason.startsWith("Missing Bearer") ? Effect.succeed(undefined) : Effect.fail(err)
        )
      ),
  });
}

function verifyBearerTokenEffect(token: string, config: OidcAuthConfig) {
  return verifyOidcBearerTokenEffect(token, config).pipe(Effect.map((r) => r.claims));
}

/** Live OIDC service backed by `process.env` config (re-read once at layer build). */
export const OidcAuthServiceLive = Layer.effect(
  OidcAuthService,
  Effect.sync(() => oidcAuthServiceFromConfig(loadOidcAuthConfig()))
);

/** Build an isolated OIDC service layer for tests / explicit config. */
export function createOidcAuthServiceLayer(config: OidcAuthConfig): Layer.Layer<OidcAuthService> {
  return Layer.succeed(OidcAuthService, oidcAuthServiceFromConfig(config));
}

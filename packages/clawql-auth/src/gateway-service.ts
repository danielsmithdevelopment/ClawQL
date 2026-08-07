/**
 * Effect service for gateway auth mode + ATR claim resolution.
 * Modes: noAuth | apiKey | oidc (JWT consumer — ClawQL is not an IdP).
 */

import { Context, Effect, Layer } from "effect";
import {
  assertGatewayAuthEffect,
  loadGatewayAuthConfig,
  resolveAtrClaimsFromHeadersEffect,
  type AtrClaims,
  type AuthHeaderSource,
  type GatewayAuthConfig,
  type GatewayAuthError,
} from "./gateway.js";

export class GatewayAuthService extends Context.Tag("clawql/GatewayAuthService")<
  GatewayAuthService,
  {
    readonly config: GatewayAuthConfig;
    /** Resolve ATR claims from headers; fails with GatewayAuthError. */
    readonly resolveClaims: (
      headers?: AuthHeaderSource
    ) => Effect.Effect<AtrClaims, GatewayAuthError>;
    /** Assert gateway auth and return ATR claims; fails with GatewayAuthError. */
    readonly assertAuth: (headers?: AuthHeaderSource) => Effect.Effect<AtrClaims, GatewayAuthError>;
  }
>() {}

export function gatewayAuthServiceFromConfig(config: GatewayAuthConfig) {
  return GatewayAuthService.of({
    config,
    resolveClaims: (headers = {}) => resolveAtrClaimsFromHeadersEffect(headers, config),
    assertAuth: (headers = {}) => assertGatewayAuthEffect(headers, config),
  });
}

/** Live gateway auth service backed by `process.env` config. */
export const GatewayAuthServiceLive = Layer.effect(
  GatewayAuthService,
  Effect.sync(() => gatewayAuthServiceFromConfig(loadGatewayAuthConfig()))
);

/** Build an isolated gateway auth service layer for tests / explicit config. */
export function createGatewayAuthServiceLayer(
  config: GatewayAuthConfig
): Layer.Layer<GatewayAuthService> {
  return Layer.succeed(GatewayAuthService, gatewayAuthServiceFromConfig(config));
}

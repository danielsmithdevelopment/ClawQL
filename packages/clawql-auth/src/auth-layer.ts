/**
 * Composed live Layer for clawql-auth Effect services.
 * ClawQL is an auth *consumer* / step-up library, not a full IdP.
 *
 * `AuthLive` merges the env-backed services that need no per-call configuration:
 * OIDC verification, gateway auth mode resolution, and AWS SigV4 signing.
 * The step-up store depends on a file path — provide it separately via
 * {@link createStepUpStoreLayer}.
 */

import { Layer } from "effect";
import { AwsSigV4Service, AwsSigV4ServiceLive } from "./aws-sigv4.js";
import { GatewayAuthService, GatewayAuthServiceLive } from "./gateway-service.js";
import { OidcAuthService, OidcAuthServiceLive } from "./oidc-service.js";

export type AuthServices = OidcAuthService | GatewayAuthService | AwsSigV4Service;

/** Env-backed live services for OIDC, gateway auth, and AWS SigV4. */
export const AuthLive: Layer.Layer<AuthServices> = Layer.mergeAll(
  OidcAuthServiceLive,
  GatewayAuthServiceLive,
  AwsSigV4ServiceLive
);

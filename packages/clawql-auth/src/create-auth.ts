/**
 * createClawQLAuth — composition helper for gateway hosts (modularization §4.3).
 * ClawQL remains an auth *consumer* / step-up library, not a full IdP.
 *
 * The surface is Effect-first: `resolveClaimsEffect` / `assertToolAccessEffect` and an Effect
 * step-up layer. A single `resolveClaimsAsync` Promise method is kept as a thin `Effect.runPromise`
 * wrapper for MCP / Express hosts that consume the discriminated-union shape at their edge.
 */

import { Effect, type Layer } from "effect";

import {
  loadGatewayAuthConfig,
  resolveAtrClaimsFromHeaders,
  resolveAtrClaimsFromHeadersEffect,
  type AtrClaims,
  type AuthHeaderSource,
  type AuthMode,
  type GatewayAuthError,
  type GatewayAuthConfig,
} from "./gateway.js";
import {
  assertToolPolicyEffect,
  type AssertToolPolicyOptions,
  type AuthPolicyError,
} from "./policy.js";
import {
  createStepUpStoreLayer,
  createUnimplementedWebAuthnVerifier,
  generateTotpEffect,
  generateTotpSecretEffect,
  StepUpStoreService,
  totpOtpauthUrlEffect,
  verifyTotpEffect,
  type WebAuthnStepUpVerifier,
} from "./step-up/index.js";

export type CreateClawQLAuthOptions = {
  mode?: AuthMode;
  apiKey?: string;
  apiKeyClaimsResolver?: GatewayAuthConfig["apiKeyClaimsResolver"];
  oidc?: GatewayAuthConfig["oidc"];
  /** Optional path for file-backed TOTP enrollments. */
  stepUpStorePath?: string;
  webauthnVerifier?: WebAuthnStepUpVerifier;
  rbac?: { enabled?: boolean };
};

export type ClawQLAuth = {
  readonly mode: AuthMode;
  readonly config: GatewayAuthConfig;
  /** Sync claim resolution for `noAuth` / `apiKey`; `oidc` requires the Effect/async forms. */
  resolveClaims(
    headers?: AuthHeaderSource
  ): { ok: true; claims: AtrClaims } | { ok: false; error: string };
  /** Thin `Effect.runPromise` wrapper for MCP / Express hosts (supports oidc JWT verify). */
  resolveClaimsAsync(
    headers?: AuthHeaderSource
  ): Promise<{ ok: true; claims: AtrClaims } | { ok: false; error: string }>;
  /** Effect form of claim resolution (supports oidc JWT verify + sync modes). */
  resolveClaimsEffect(headers?: AuthHeaderSource): Effect.Effect<AtrClaims, GatewayAuthError>;
  /** Effect form of tool-access policy — fails on the typed AuthPolicyError channel. */
  assertToolAccessEffect(
    claims: AtrClaims,
    toolName: string,
    options?: AssertToolPolicyOptions
  ): Effect.Effect<void, AuthPolicyError>;
  stepUp: {
    /** Effect-primary TOTP surface. */
    totp: {
      generateSecret: typeof generateTotpSecretEffect;
      generate: typeof generateTotpEffect;
      verify: typeof verifyTotpEffect;
      otpauthUrl: typeof totpOtpauthUrlEffect;
    };
    /** Layer providing {@link StepUpStoreService} when `stepUpStorePath` was set. */
    storeLayer: Layer.Layer<StepUpStoreService> | undefined;
    webauthn: WebAuthnStepUpVerifier;
  };
};

export function createClawQLAuth(options: CreateClawQLAuthOptions = {}): ClawQLAuth {
  const base = loadGatewayAuthConfig();
  const config: GatewayAuthConfig = {
    mode: options.mode ?? base.mode,
    apiKey: options.apiKey ?? base.apiKey,
    apiKeyClaimsResolver: options.apiKeyClaimsResolver ?? base.apiKeyClaimsResolver,
    oidc: options.oidc ?? base.oidc,
  };

  const storeLayer = options.stepUpStorePath
    ? createStepUpStoreLayer(options.stepUpStorePath)
    : undefined;

  return {
    mode: config.mode,
    config,
    resolveClaims(headers = {}) {
      return resolveAtrClaimsFromHeaders(headers, config);
    },
    resolveClaimsAsync(headers = {}) {
      return Effect.runPromise(
        resolveAtrClaimsFromHeadersEffect(headers, config).pipe(
          Effect.map((claims) => ({ ok: true, claims }) as const),
          Effect.catchAll((err) => Effect.succeed({ ok: false, error: err.reason } as const))
        )
      );
    },
    resolveClaimsEffect(headers = {}) {
      return resolveAtrClaimsFromHeadersEffect(headers, config);
    },
    assertToolAccessEffect(claims, toolName, policyOptions) {
      if (options.rbac?.enabled === false) return Effect.void;
      return assertToolPolicyEffect(claims, toolName, policyOptions);
    },
    stepUp: {
      totp: {
        generateSecret: generateTotpSecretEffect,
        generate: generateTotpEffect,
        verify: verifyTotpEffect,
        otpauthUrl: totpOtpauthUrlEffect,
      },
      storeLayer,
      webauthn: options.webauthnVerifier ?? createUnimplementedWebAuthnVerifier(),
    },
  };
}

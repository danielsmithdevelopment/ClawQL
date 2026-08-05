/**
 * createClawQLAuth — composition helper for gateway hosts (modularization §4.3).
 * ClawQL remains an auth *consumer* / step-up library, not a full IdP.
 */

import {
  loadGatewayAuthConfig,
  resolveAtrClaimsFromHeaders,
  resolveAtrClaimsFromHeadersAsync,
  type AtrClaims,
  type AuthHeaderSource,
  type AuthMode,
  type GatewayAuthConfig,
} from "./gateway.js";
import { assertToolPolicy, type AssertToolPolicyOptions } from "./policy.js";
import {
  createFileStepUpStore,
  createUnimplementedWebAuthnVerifier,
  generateTotp,
  generateTotpSecret,
  totpOtpauthUrl,
  verifyTotp,
  type FileStepUpStore,
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
  resolveClaims(
    headers?: AuthHeaderSource
  ): { ok: true; claims: AtrClaims } | { ok: false; error: string };
  resolveClaimsAsync(
    headers?: AuthHeaderSource
  ): Promise<{ ok: true; claims: AtrClaims } | { ok: false; error: string }>;
  assertToolAccess(claims: AtrClaims, toolName: string, options?: AssertToolPolicyOptions): void;
  stepUp: {
    totp: {
      generateSecret: typeof generateTotpSecret;
      generate: typeof generateTotp;
      verify: typeof verifyTotp;
      otpauthUrl: typeof totpOtpauthUrl;
    };
    store: FileStepUpStore | undefined;
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

  const store = options.stepUpStorePath
    ? createFileStepUpStore(options.stepUpStorePath)
    : undefined;

  return {
    mode: config.mode,
    config,
    resolveClaims(headers = {}) {
      return resolveAtrClaimsFromHeaders(headers, config);
    },
    resolveClaimsAsync(headers = {}) {
      return resolveAtrClaimsFromHeadersAsync(headers, config);
    },
    assertToolAccess(claims, toolName, policyOptions) {
      // RBAC flag reserved for future role matrices; MFA financial gate is active today.
      if (options.rbac?.enabled === false) return;
      assertToolPolicy(claims, toolName, policyOptions);
    },
    stepUp: {
      totp: {
        generateSecret: generateTotpSecret,
        generate: generateTotp,
        verify: verifyTotp,
        otpauthUrl: totpOtpauthUrl,
      },
      store,
      webauthn: options.webauthnVerifier ?? createUnimplementedWebAuthnVerifier(),
    },
  };
}

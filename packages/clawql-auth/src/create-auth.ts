/**
 * createClawQLAuth — composition helper for gateway hosts (modularization §4.3).
 * ClawQL remains an auth *consumer* / step-up library, not a full IdP.
 *
 * Effect-primary: `resolveClaimsEffect` / `assertToolAccessEffect` + Effect step-up.
 * Hosts that need a Promise call `Effect.runPromise` at their own Express/MCP edge —
 * this package does not ship convenience Promise façades.
 *
 * Ready density: `clawql-auth/step-up` and `clawql-auth/api-keys` are loaded via
 * createRequire on first use (same pattern as DuckDB / jose) so equal-arm
 * apiKey/noAuth listen does not evaluate TOTP/WebAuthn or issued-key store modules.
 * Default SecretStore is also constructed lazily. (`jose` is deferred inside oidc.)
 */

import { createRequire } from "node:module";
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
import type { StepUpStoreService } from "./step-up/store.js";
import type { WebAuthnStepUpVerifier } from "./step-up/webauthn.js";
import type { IssuedApiKeyStore } from "./api-keys/store.js";
import type { AuthEventSink } from "./audit/auth-events.js";
import { resolveSecretStore, type ResolveSecretStoreOptions } from "./stores/resolve.js";
import type { SecretStore } from "./stores/types.js";

type StepUpMod = typeof import("./step-up/index.js");
type ApiKeysMod = typeof import("./api-keys/index.js");

const requireFromHere = createRequire(import.meta.url);

function loadStepUp(): StepUpMod {
  return requireFromHere("clawql-auth/step-up") as StepUpMod;
}

function loadApiKeys(): ApiKeysMod {
  return requireFromHere("clawql-auth/api-keys") as ApiKeysMod;
}

export type CreateClawQLAuthOptions = {
  mode?: AuthMode;
  apiKey?: string;
  apiKeyClaimsResolver?: GatewayAuthConfig["apiKeyClaimsResolver"];
  oidc?: GatewayAuthConfig["oidc"];
  /** Optional path for file-backed TOTP enrollments. */
  stepUpStorePath?: string;
  /**
   * Optional path for issued API keys (`cqk_…`).
   * When set, wires a claims resolver that validates active (non-revoked) keys —
   * primary path for enterprise org/team key management.
   */
  apiKeyStorePath?: string;
  /**
   * Swappable secret backend (SQLite default via {@link resolveSecretStore}).
   * Pass an explicit `SecretStore` or `{ kind: "openbao" | "hashicorp-vault" | … }`.
   */
  secretStore?: SecretStore | ResolveSecretStoreOptions;
  /** Optional auth event sink (WORM / audit). */
  authEventSink?: AuthEventSink;
  webauthnVerifier?: WebAuthnStepUpVerifier;
  rbac?: { enabled?: boolean };
};

export type ClawQLAuth = {
  readonly mode: AuthMode;
  readonly config: GatewayAuthConfig;
  /** Issued API key registry when `apiKeyStorePath` was provided. */
  readonly apiKeys: IssuedApiKeyStore | undefined;
  /** Pluggable secret backend (OAuth tokens, keys, nonces). Lazy-default SQLite. */
  readonly secretStore: SecretStore;
  /** Sync claim resolution for `noAuth` / `apiKey`; `oidc` / `mcpOAuth` require Effect. */
  resolveClaims(
    headers?: AuthHeaderSource
  ): { ok: true; claims: AtrClaims } | { ok: false; error: string };
  /** Effect claim resolution (supports oidc JWT verify + sync modes). */
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
      generateSecret: StepUpMod["generateTotpSecretEffect"];
      generate: StepUpMod["generateTotpEffect"];
      verify: StepUpMod["verifyTotpEffect"];
      otpauthUrl: StepUpMod["totpOtpauthUrlEffect"];
    };
    /** Layer providing {@link StepUpStoreService} when `stepUpStorePath` was set. */
    storeLayer: Layer.Layer<StepUpStoreService> | undefined;
    webauthn: WebAuthnStepUpVerifier;
  };
};

function composeApiKeyClaimsResolver(
  issued: IssuedApiKeyStore | undefined,
  explicit: GatewayAuthConfig["apiKeyClaimsResolver"] | undefined
): GatewayAuthConfig["apiKeyClaimsResolver"] | undefined {
  if (!issued && !explicit) return undefined;
  if (issued && !explicit) return issued.asClaimsResolver();
  if (!issued && explicit) return explicit;
  const issuedResolver = issued!.asClaimsResolver();
  return (presented, headers) => {
    const fromIssued = issuedResolver(presented, headers);
    if (fromIssued !== null) return fromIssued;
    return explicit!(presented, headers);
  };
}

function resolveAuthSecretStore(input: CreateClawQLAuthOptions["secretStore"]): SecretStore {
  if (!input) return resolveSecretStore();
  if (typeof input === "object" && "getSecret" in input && typeof input.getSecret === "function") {
    return input as SecretStore;
  }
  return resolveSecretStore(input as ResolveSecretStoreOptions);
}

export function createClawQLAuth(options: CreateClawQLAuthOptions = {}): ClawQLAuth {
  const base = Effect.runSync(loadGatewayAuthConfig());
  const apiKeys = options.apiKeyStorePath
    ? loadApiKeys().createIssuedApiKeyStore({
        path: options.apiKeyStorePath,
        eventSink: options.authEventSink,
      })
    : undefined;

  const config: GatewayAuthConfig = {
    mode: options.mode ?? base.mode,
    apiKey: options.apiKey ?? base.apiKey,
    apiKeyClaimsResolver: composeApiKeyClaimsResolver(
      apiKeys,
      options.apiKeyClaimsResolver ?? base.apiKeyClaimsResolver
    ),
    oidc: options.oidc ?? base.oidc,
  };

  let secretStoreCache: SecretStore | undefined;
  const getSecretStore = (): SecretStore => {
    if (!secretStoreCache) {
      secretStoreCache = resolveAuthSecretStore(options.secretStore);
    }
    return secretStoreCache;
  };

  let stepUpCache: ClawQLAuth["stepUp"] | undefined;
  const getStepUp = (): ClawQLAuth["stepUp"] => {
    if (!stepUpCache) {
      const stepUp = loadStepUp();
      const storeLayer = options.stepUpStorePath
        ? stepUp.createStepUpStoreLayer(options.stepUpStorePath)
        : undefined;
      stepUpCache = {
        totp: {
          generateSecret: stepUp.generateTotpSecretEffect,
          generate: stepUp.generateTotpEffect,
          verify: stepUp.verifyTotpEffect,
          otpauthUrl: stepUp.totpOtpauthUrlEffect,
        },
        storeLayer,
        webauthn: options.webauthnVerifier ?? stepUp.createUnimplementedWebAuthnVerifier(),
      };
    }
    return stepUpCache;
  };

  return {
    mode: config.mode,
    config,
    apiKeys,
    get secretStore() {
      return getSecretStore();
    },
    resolveClaims(headers = {}) {
      return resolveAtrClaimsFromHeaders(headers, config);
    },
    resolveClaimsEffect(headers = {}) {
      return resolveAtrClaimsFromHeadersEffect(headers, config);
    },
    assertToolAccessEffect(claims, toolName, policyOptions) {
      if (options.rbac?.enabled === false) return Effect.void;
      return assertToolPolicyEffect(claims, toolName, policyOptions);
    },
    get stepUp() {
      return getStepUp();
    },
  };
}

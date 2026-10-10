/**
 * Environment-driven MCP OAuth 2.1 + EMA bootstrap for HTTP hosts.
 * Effect-primary — no Promise domain API.
 */

import { readFileSync } from "node:fs";
import { Effect } from "effect";

import type { AuthEventSink } from "../audit/auth-events.js";
import { createAuthEventSinkFromEnv } from "../audit/auth-worm-sink.js";
import {
  warnIfMcpOAuthAuditDisabled,
  warnIfMcpOAuthBootstrapInvalid,
  warnIfMcpOAuthHs256Only,
} from "../audit/mcp-oauth-startup-warnings.js";
import type { AtrClaims } from "../gateway.js";
import { resolveSecretStore, type SecretStore } from "../stores/index.js";
import { createMemorySecretStore } from "../stores/memory.js";
import {
  bootstrapEmaOrgsToStoreEffect,
  createCompositeEmaConfigStore,
  createSecretStoreEmaConfigStore,
  loadEmaOrgsFromJson,
  loadEmaOrgsFromJsonFile,
  type SecretStoreEmaConfigStore,
} from "./ema-config-store.js";
import {
  createSecretStoreMcpAuthorizationCodeStore,
  createMemoryMcpAuthorizationCodeStore,
} from "./mcp-auth-code-store.js";
import { createIdJagIssuerFromEnv, type IdJagIssuerRuntime } from "./id-jag-issuer-env.js";
import { createMemoryEmaConfigStore, type EmaOrgConfig } from "./id-jag.js";
import {
  createMCPOAuthServer,
  createMemoryMcpClientRegistry,
  type MCPOAuthConfig,
  type MCPOAuthServer,
  type McpOAuthError,
  type McpRegisteredClient,
  type McpTrustedClientRecord,
} from "./mcp-oauth.js";
import {
  createCimdClientRegistry,
  createSecretStoreTrustedClientStore,
  type TrustedClientStore,
} from "./mcp-cimd.js";
import {
  createMemoryDeviceCodeStore,
  createSecretStoreDeviceCodeStore,
} from "./mcp-device-flow.js";
import { createSecretStoreMcpGrantKeyStore, grantAsKeyEnabled } from "./mcp-grant-key-store.js";
import {
  loadMcpOAuthSigningFromEnvEffect,
  mcpOAuthSigningConfigured,
  type McpOAuthSigningError,
  type McpOAuthSigningMaterial,
} from "./mcp-oauth-signing.js";
import {
  bootstrapMcpClientsToStoreEffect,
  createCompositeMcpClientRegistry,
  createSecretStoreMcpAccessTokenStore,
  createSecretStoreMcpClientRegistry,
  createSecretStoreMcpRefreshStore,
  loadMcpClientsFromJson,
  loadMcpClientsFromJsonFile,
  type SecretStoreMcpClientRegistry,
} from "./mcp-oauth-stores.js";
import { isMcpOAuthBootstrapStrict, McpOAuthBootstrapError } from "./mcp-oauth-bootstrap.js";

export type McpOAuthEnvConfig = {
  enabled: boolean;
  issuer?: string;
  signingSecret?: string;
  resourceAudience?: string;
  tokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function readOptionalFile(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const path = env[key]?.trim();
  if (!path) return undefined;
  return readFileSync(path, "utf8");
}

export function loadMcpOAuthEnvConfig(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<McpOAuthEnvConfig> {
  return Effect.sync(() => {
    const enabled =
      envFlag("CLAWQL_MCP_OAUTH_ENABLED", env) ||
      envFlag("CLAWQL_MCP_OAUTH", env) ||
      mcpOAuthSigningConfigured(env);

    const tokenTtlRaw = env.CLAWQL_MCP_OAUTH_TOKEN_TTL_SECONDS?.trim();
    const refreshTtlRaw = env.CLAWQL_MCP_OAUTH_REFRESH_TTL_SECONDS?.trim();

    return {
      enabled,
      issuer: env.CLAWQL_MCP_OAUTH_ISSUER?.trim() || undefined,
      signingSecret: env.CLAWQL_MCP_OAUTH_SIGNING_SECRET?.trim() || undefined,
      resourceAudience:
        env.CLAWQL_MCP_OAUTH_RESOURCE_AUDIENCE?.trim() ||
        env.CLAWQL_MCP_OAUTH_AUDIENCE?.trim() ||
        undefined,
      tokenTtlSeconds: tokenTtlRaw ? Number.parseInt(tokenTtlRaw, 10) : undefined,
      refreshTokenTtlSeconds: refreshTtlRaw ? Number.parseInt(refreshTtlRaw, 10) : undefined,
    };
  });
}

export function isMcpOAuthEnabled(env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> {
  return loadMcpOAuthEnvConfig(env).pipe(Effect.map((c) => c.enabled));
}

export type CreateMcpOAuthFromEnvOptions = {
  env?: NodeJS.ProcessEnv;
  secretStore?: SecretStore;
  eventSink?: AuthEventSink;
  /** Override issuer when env unset (e.g. derived from request Host). */
  issuer?: string;
};

export type McpOAuthRuntime = {
  server: MCPOAuthServer;
  config: MCPOAuthConfig;
  emaStore: SecretStoreEmaConfigStore;
  clientRegistry: SecretStoreMcpClientRegistry;
  /** Validates ClawQL-issued MCP access tokens → ATR claims (Effect-primary). */
  validateBearer: (token: string) => Effect.Effect<AtrClaims, McpOAuthError>;
  /** JWKS document when RS256 signing is configured. */
  jwks?: McpOAuthSigningMaterial["jwks"];
  /** Self-hosted ID-JAG issuer when `CLAWQL_ID_JAG_ISSUER_ENABLED=1`. */
  idJagIssuer?: IdJagIssuerRuntime;
};

function loadEmaBootstrapConfigs(
  env: NodeJS.ProcessEnv
): Effect.Effect<EmaOrgConfig[], McpOAuthBootstrapError> {
  return Effect.gen(function* () {
    const inline = env.CLAWQL_EMA_ORGS_JSON?.trim();
    if (inline) {
      return yield* Effect.try({
        try: () => loadEmaOrgsFromJson(inline),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((cause) =>
          isMcpOAuthBootstrapStrict(env)
            ? Effect.fail(new McpOAuthBootstrapError({ source: "CLAWQL_EMA_ORGS_JSON", cause }))
            : warnIfMcpOAuthBootstrapInvalid("CLAWQL_EMA_ORGS_JSON", cause).pipe(
                Effect.as([] as EmaOrgConfig[])
              )
        )
      );
    }
    const path = env.CLAWQL_EMA_ORGS_PATH?.trim();
    if (path) {
      return yield* Effect.try({
        try: () => loadEmaOrgsFromJsonFile(path),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((cause) =>
          isMcpOAuthBootstrapStrict(env)
            ? Effect.fail(new McpOAuthBootstrapError({ source: "CLAWQL_EMA_ORGS_PATH", cause }))
            : warnIfMcpOAuthBootstrapInvalid("CLAWQL_EMA_ORGS_PATH", cause).pipe(
                Effect.as([] as EmaOrgConfig[])
              )
        )
      );
    }
    const filePath = env.CLAWQL_EMA_ORGS_FILE?.trim();
    if (filePath) {
      return yield* Effect.try({
        try: () => {
          const fileRaw = readOptionalFile(env, "CLAWQL_EMA_ORGS_FILE");
          if (!fileRaw) throw new Error("empty_or_unreadable");
          return loadEmaOrgsFromJson(fileRaw);
        },
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((cause) =>
          isMcpOAuthBootstrapStrict(env)
            ? Effect.fail(new McpOAuthBootstrapError({ source: "CLAWQL_EMA_ORGS_FILE", cause }))
            : warnIfMcpOAuthBootstrapInvalid("CLAWQL_EMA_ORGS_FILE", cause).pipe(
                Effect.as([] as EmaOrgConfig[])
              )
        )
      );
    }
    return [];
  });
}

function loadMcpClientBootstrap(
  env: NodeJS.ProcessEnv
): Effect.Effect<McpRegisteredClient[], McpOAuthBootstrapError> {
  return Effect.gen(function* () {
    const inline = env.CLAWQL_MCP_OAUTH_CLIENTS_JSON?.trim();
    if (inline) {
      return yield* Effect.try({
        try: () => loadMcpClientsFromJson(inline),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((cause) =>
          isMcpOAuthBootstrapStrict(env)
            ? Effect.fail(
                new McpOAuthBootstrapError({ source: "CLAWQL_MCP_OAUTH_CLIENTS_JSON", cause })
              )
            : warnIfMcpOAuthBootstrapInvalid("CLAWQL_MCP_OAUTH_CLIENTS_JSON", cause).pipe(
                Effect.as([] as McpRegisteredClient[])
              )
        )
      );
    }
    const path = env.CLAWQL_MCP_OAUTH_CLIENTS_PATH?.trim();
    if (path) {
      return yield* Effect.try({
        try: () => loadMcpClientsFromJsonFile(path),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((cause) =>
          isMcpOAuthBootstrapStrict(env)
            ? Effect.fail(
                new McpOAuthBootstrapError({ source: "CLAWQL_MCP_OAUTH_CLIENTS_PATH", cause })
              )
            : warnIfMcpOAuthBootstrapInvalid("CLAWQL_MCP_OAUTH_CLIENTS_PATH", cause).pipe(
                Effect.as([] as McpRegisteredClient[])
              )
        )
      );
    }
    return [];
  });
}

function loadTrustedClientsFromJson(raw: string): McpTrustedClientRecord[] {
  const parsed = JSON.parse(raw) as
    { clients?: McpTrustedClientRecord[] } | McpTrustedClientRecord[];
  const list = Array.isArray(parsed) ? parsed : (parsed.clients ?? []);
  return list.filter(
    (c): c is McpTrustedClientRecord =>
      typeof c?.clientIdUrl === "string" &&
      Array.isArray(c.redirectUris) &&
      typeof c.trustedAtMs === "number"
  );
}

function loadTrustedClientsBootstrap(
  env: NodeJS.ProcessEnv
): Effect.Effect<McpTrustedClientRecord[], McpOAuthBootstrapError> {
  return Effect.gen(function* () {
    const inline = env.CLAWQL_MCP_OAUTH_TRUSTED_CLIENTS_JSON?.trim();
    if (inline) {
      return yield* Effect.try({
        try: () => loadTrustedClientsFromJson(inline),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((cause) =>
          isMcpOAuthBootstrapStrict(env)
            ? Effect.fail(
                new McpOAuthBootstrapError({
                  source: "CLAWQL_MCP_OAUTH_TRUSTED_CLIENTS_JSON",
                  cause,
                })
              )
            : warnIfMcpOAuthBootstrapInvalid("CLAWQL_MCP_OAUTH_TRUSTED_CLIENTS_JSON", cause).pipe(
                Effect.as([] as McpTrustedClientRecord[])
              )
        )
      );
    }
    const path = env.CLAWQL_MCP_OAUTH_TRUSTED_CLIENTS_PATH?.trim();
    if (path) {
      return yield* Effect.try({
        try: () => loadTrustedClientsFromJson(readFileSync(path, "utf8")),
        catch: (cause) => cause,
      }).pipe(
        Effect.catch((cause) =>
          isMcpOAuthBootstrapStrict(env)
            ? Effect.fail(
                new McpOAuthBootstrapError({
                  source: "CLAWQL_MCP_OAUTH_TRUSTED_CLIENTS_PATH",
                  cause,
                })
              )
            : warnIfMcpOAuthBootstrapInvalid("CLAWQL_MCP_OAUTH_TRUSTED_CLIENTS_PATH", cause).pipe(
                Effect.as([] as McpTrustedClientRecord[])
              )
        )
      );
    }
    return [];
  });
}

function bootstrapTrustedClientsEffect(
  store: TrustedClientStore,
  clients: readonly McpTrustedClientRecord[]
): Effect.Effect<number> {
  return Effect.gen(function* () {
    let n = 0;
    for (const client of clients) {
      yield* store.upsert(client);
      n += 1;
    }
    return n;
  });
}

/**
 * Build {@link MCPOAuthServer} from environment when enabled.
 * Returns `null` when disabled or signing secret missing.
 */
export function createMcpOAuthFromEnv(
  options: CreateMcpOAuthFromEnvOptions = {}
): Effect.Effect<McpOAuthRuntime | null, McpOAuthSigningError | McpOAuthBootstrapError> {
  return Effect.gen(function* () {
    const env = options.env ?? process.env;
    const envConfig = yield* loadMcpOAuthEnvConfig(env);
    if (!envConfig.enabled) return null;

    yield* warnIfMcpOAuthAuditDisabled(env);
    yield* warnIfMcpOAuthHs256Only(env);

    const signing = yield* loadMcpOAuthSigningFromEnvEffect(env);

    const secretStore = options.secretStore ?? resolveSecretStore();
    const emaStore = createSecretStoreEmaConfigStore(secretStore);
    const clientRegistry = createSecretStoreMcpClientRegistry(secretStore);
    const refreshStore = createSecretStoreMcpRefreshStore(secretStore);
    const accessTokenStore = createSecretStoreMcpAccessTokenStore(secretStore);

    yield* bootstrapEmaOrgsToStoreEffect(emaStore, yield* loadEmaBootstrapConfigs(env));
    yield* bootstrapMcpClientsToStoreEffect(clientRegistry, yield* loadMcpClientBootstrap(env));

    const memoryClients = createMemoryMcpClientRegistry([]);
    const emaConfigStore = createCompositeEmaConfigStore(emaStore, createMemoryEmaConfigStore([]));
    const clients = createCompositeMcpClientRegistry(memoryClients, clientRegistry);

    const issuer =
      options.issuer ??
      envConfig.issuer ??
      env.CLAWQL_PUBLIC_ORIGIN?.trim()?.replace(/\/$/, "") ??
      "https://clawql.local";

    const eventSink = options.eventSink ?? createAuthEventSinkFromEnv(env);

    const authCodeStore = createSecretStoreMcpAuthorizationCodeStore(secretStore);

    const deviceFlowEnabled = envFlag("CLAWQL_MCP_OAUTH_DEVICE_FLOW", env);
    const verificationUri =
      env.CLAWQL_MCP_OAUTH_DEVICE_VERIFICATION_URI?.trim() ||
      `${issuer.replace(/\/$/, "")}/oauth/device`;

    const grantAsKey = grantAsKeyEnabled(env, false);

    const config: MCPOAuthConfig = {
      issuer,
      signing,
      resourceAudience: envConfig.resourceAudience,
      tokenTtlSeconds: envConfig.tokenTtlSeconds,
      refreshTokenTtlSeconds: envConfig.refreshTokenTtlSeconds,
      emaConfigStore,
      authCodeStore,
      accessTokenStore,
      eventSink,
      ...(grantAsKey ? { grantKeyStore: createSecretStoreMcpGrantKeyStore(secretStore) } : {}),
      ...(deviceFlowEnabled
        ? {
            deviceCodeStore: createSecretStoreDeviceCodeStore(secretStore),
            deviceFlow: { verificationUri },
          }
        : {}),
    };

    const cimdEnabled = envFlag("CLAWQL_MCP_OAUTH_CIMD", env);
    let effectiveClients = clients;
    if (cimdEnabled) {
      const trustedStore = createSecretStoreTrustedClientStore(secretStore);
      yield* bootstrapTrustedClientsEffect(trustedStore, yield* loadTrustedClientsBootstrap(env));
      effectiveClients = createCimdClientRegistry(clients, trustedStore, {
        writable: clientRegistry,
      });
    }

    const server = createMCPOAuthServer(config, effectiveClients, refreshStore);

    const idJagIssuer = yield* createIdJagIssuerFromEnv({
      env,
      secretStore,
      eventSink,
      publicOrigin: issuer,
    });

    return {
      server,
      config,
      emaStore,
      clientRegistry,
      validateBearer: (token: string) => server.validateToken(token),
      jwks: signing.jwks.keys.length ? signing.jwks : undefined,
      idJagIssuer: idJagIssuer ?? undefined,
    };
  });
}

/** In-memory MCP OAuth for tests (MemorySecretStore-backed EMA + clients). */
export function createMcpOAuthForTests(input: {
  issuer: string;
  signingSecret?: string;
  signing?: McpOAuthSigningMaterial;
  resourceAudience?: string;
  clients?: McpRegisteredClient[];
  emaOrgs?: EmaOrgConfig[];
  eventSink?: AuthEventSink;
  /** When true, wires RFC 8628 device flow (store + verification URI). */
  deviceFlow?: boolean | { verificationUri: string };
}): Effect.Effect<McpOAuthRuntime> {
  return Effect.gen(function* () {
    const secretStore = createMemorySecretStore();
    const emaStore = createSecretStoreEmaConfigStore(secretStore);
    const clientRegistry = createSecretStoreMcpClientRegistry(secretStore);
    const refreshStore = createSecretStoreMcpRefreshStore(secretStore);

    yield* bootstrapEmaOrgsToStoreEffect(emaStore, input.emaOrgs ?? [], { overwrite: true });
    yield* bootstrapMcpClientsToStoreEffect(clientRegistry, input.clients ?? [], {
      overwrite: true,
    });

    const deviceFlowOpt = input.deviceFlow;
    const deviceFlowEnabled = Boolean(deviceFlowOpt);
    const verificationUri =
      typeof deviceFlowOpt === "object" && deviceFlowOpt.verificationUri
        ? deviceFlowOpt.verificationUri
        : "https://auth.clawql.test/oauth/device";

    const config: MCPOAuthConfig = {
      issuer: input.issuer,
      signingSecret: input.signingSecret,
      signing: input.signing,
      resourceAudience: input.resourceAudience,
      emaConfigStore: emaStore,
      authCodeStore: createMemoryMcpAuthorizationCodeStore(),
      accessTokenStore: createSecretStoreMcpAccessTokenStore(secretStore),
      eventSink: input.eventSink,
      ...(deviceFlowEnabled
        ? {
            deviceCodeStore: createMemoryDeviceCodeStore(),
            deviceFlow: { verificationUri },
          }
        : {}),
    };
    const server = createMCPOAuthServer(
      config,
      createCompositeMcpClientRegistry(clientRegistry),
      refreshStore
    );
    const resolvedSigning =
      input.signing ??
      (input.signingSecret
        ? {
            algorithm: "HS256" as const,
            signKey: new TextEncoder().encode(input.signingSecret),
            verifyKey: new TextEncoder().encode(input.signingSecret),
            jwks: { keys: [] as import("jose").JWK[] },
          }
        : undefined);
    return {
      server,
      config,
      emaStore,
      clientRegistry,
      validateBearer: (token: string) => server.validateToken(token),
      jwks: resolvedSigning?.jwks.keys.length ? resolvedSigning.jwks : undefined,
    };
  });
}

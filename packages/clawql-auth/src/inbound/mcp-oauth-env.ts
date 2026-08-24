/**
 * Environment-driven MCP OAuth 2.1 + EMA bootstrap for HTTP hosts.
 */

import { readFileSync } from "node:fs";

import type { AuthEventSink } from "../audit/auth-events.js";
import { createAuthEventSinkFromEnv } from "../audit/auth-worm-sink.js";
import { warnIfMcpOAuthAuditDisabled } from "../audit/mcp-oauth-startup-warnings.js";
import {
  loadMcpOAuthSigningFromEnvEffect,
  mcpOAuthSigningConfigured,
  type McpOAuthSigningMaterial,
} from "./mcp-oauth-signing.js";
import { resolveSecretStore, type SecretStore } from "../stores/index.js";
import { createMemorySecretStore } from "../stores/memory.js";
import {
  bootstrapEmaOrgsToStore,
  createCompositeEmaConfigStore,
  createSecretStoreEmaConfigStore,
  loadEmaOrgsFromJson,
  loadEmaOrgsFromJsonFile,
  type SecretStoreEmaConfigStore,
} from "./ema-config-store.js";
import {
  bootstrapMcpClientsToStore,
  createCompositeMcpClientRegistry,
  createSecretStoreMcpClientRegistry,
  createSecretStoreMcpRefreshStore,
  loadMcpClientsFromJson,
  loadMcpClientsFromJsonFile,
  type SecretStoreMcpClientRegistry,
} from "./mcp-oauth-stores.js";
import {
  createMCPOAuthServer,
  createMemoryMcpClientRegistry,
  createMemoryMcpRefreshStore,
  type MCPOAuthConfig,
  type MCPOAuthServer,
  type McpRegisteredClient,
} from "./mcp-oauth.js";
import { createMemoryEmaConfigStore, type EmaOrgConfig } from "./id-jag.js";
import { createIdJagIssuerFromEnv, type IdJagIssuerRuntime } from "./id-jag-issuer-env.js";
import { Effect } from "effect";

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

export function loadMcpOAuthEnvConfig(env: NodeJS.ProcessEnv = process.env): McpOAuthEnvConfig {
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
}

export function isMcpOAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return loadMcpOAuthEnvConfig(env).enabled;
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
  /** Validates ClawQL-issued MCP access tokens → ATR claims. */
  validateBearer: (token: string) => Promise<import("../gateway.js").AtrClaims>;
  /** JWKS document when RS256 signing is configured. */
  jwks?: McpOAuthSigningMaterial["jwks"];
  /** Self-hosted ID-JAG issuer when `CLAWQL_ID_JAG_ISSUER_ENABLED=1`. */
  idJagIssuer?: IdJagIssuerRuntime;
};

function loadEmaBootstrapConfigs(env: NodeJS.ProcessEnv): EmaOrgConfig[] {
  const inline = env.CLAWQL_EMA_ORGS_JSON?.trim();
  if (inline) {
    try {
      return loadEmaOrgsFromJson(inline);
    } catch {
      return [];
    }
  }
  const path = env.CLAWQL_EMA_ORGS_PATH?.trim();
  if (path) {
    try {
      return loadEmaOrgsFromJsonFile(path);
    } catch {
      return [];
    }
  }
  const fileRaw = readOptionalFile(env, "CLAWQL_EMA_ORGS_FILE");
  if (fileRaw) {
    try {
      return loadEmaOrgsFromJson(fileRaw);
    } catch {
      return [];
    }
  }
  return [];
}

function loadMcpClientBootstrap(env: NodeJS.ProcessEnv): McpRegisteredClient[] {
  const inline = env.CLAWQL_MCP_OAUTH_CLIENTS_JSON?.trim();
  if (inline) {
    try {
      return loadMcpClientsFromJson(inline);
    } catch {
      return [];
    }
  }
  const path = env.CLAWQL_MCP_OAUTH_CLIENTS_PATH?.trim();
  if (path) {
    try {
      return loadMcpClientsFromJsonFile(path);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Build {@link MCPOAuthServer} from environment when enabled.
 * Returns `null` when disabled or signing secret missing.
 */
export async function createMcpOAuthFromEnv(
  options: CreateMcpOAuthFromEnvOptions = {}
): Promise<McpOAuthRuntime | null> {
  const env = options.env ?? process.env;
  const envConfig = loadMcpOAuthEnvConfig(env);
  if (!envConfig.enabled) return null;

  warnIfMcpOAuthAuditDisabled(env);

  const signing = await Effect.runPromise(loadMcpOAuthSigningFromEnvEffect(env));

  const secretStore = options.secretStore ?? resolveSecretStore();
  const emaStore = createSecretStoreEmaConfigStore(secretStore);
  const clientRegistry = createSecretStoreMcpClientRegistry(secretStore);
  const refreshStore = createSecretStoreMcpRefreshStore(secretStore);

  await bootstrapEmaOrgsToStore(emaStore, loadEmaBootstrapConfigs(env));
  await bootstrapMcpClientsToStore(clientRegistry, loadMcpClientBootstrap(env));

  const memoryClients = createMemoryMcpClientRegistry([]);
  const emaConfigStore = createCompositeEmaConfigStore(emaStore, createMemoryEmaConfigStore([]));
  const clients = createCompositeMcpClientRegistry(memoryClients, clientRegistry);

  const issuer =
    options.issuer ??
    envConfig.issuer ??
    env.CLAWQL_PUBLIC_ORIGIN?.trim()?.replace(/\/$/, "") ??
    "https://clawql.local";

  const eventSink = options.eventSink ?? createAuthEventSinkFromEnv(env);

  const config: MCPOAuthConfig = {
    issuer,
    signing: signing,
    resourceAudience: envConfig.resourceAudience,
    tokenTtlSeconds: envConfig.tokenTtlSeconds,
    refreshTokenTtlSeconds: envConfig.refreshTokenTtlSeconds,
    emaConfigStore,
    eventSink,
  };

  const server = createMCPOAuthServer(config, clients, refreshStore);

  const idJagIssuer = await createIdJagIssuerFromEnv({
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
    validateBearer: (token) => server.validateToken(token),
    jwks: signing.jwks.keys.length ? signing.jwks : undefined,
    idJagIssuer: idJagIssuer ?? undefined,
  };
}

/** In-memory MCP OAuth for tests (MemorySecretStore-backed EMA + clients). */
export async function createMcpOAuthForTests(input: {
  issuer: string;
  signingSecret?: string;
  signing?: McpOAuthSigningMaterial;
  resourceAudience?: string;
  clients?: McpRegisteredClient[];
  emaOrgs?: EmaOrgConfig[];
  eventSink?: AuthEventSink;
}): Promise<McpOAuthRuntime> {
  const secretStore = createMemorySecretStore();
  const emaStore = createSecretStoreEmaConfigStore(secretStore);
  const clientRegistry = createSecretStoreMcpClientRegistry(secretStore);
  const refreshStore = createSecretStoreMcpRefreshStore(secretStore);

  await bootstrapEmaOrgsToStore(emaStore, input.emaOrgs ?? [], { overwrite: true });
  await bootstrapMcpClientsToStore(clientRegistry, input.clients ?? [], { overwrite: true });

  const config: MCPOAuthConfig = {
    issuer: input.issuer,
    signingSecret: input.signingSecret,
    signing: input.signing,
    resourceAudience: input.resourceAudience,
    emaConfigStore: emaStore,
    eventSink: input.eventSink,
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
    validateBearer: (token) => server.validateToken(token),
    jwks: resolvedSigning?.jwks.keys.length ? resolvedSigning.jwks : undefined,
  };
}

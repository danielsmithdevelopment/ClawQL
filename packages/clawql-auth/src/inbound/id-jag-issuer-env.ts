/**
 * Environment bootstrap for ClawQL self-hosted ID-JAG issuer (EMA IdP).
 * Effect-primary — no Promise domain API.
 */

import { Effect } from "effect";

import type { AuthEventSink } from "../audit/auth-events.js";
import { createAuthEventSinkFromEnv } from "../audit/auth-worm-sink.js";
import { warnIfIdJagIssuerSharesMcpOAuthKey } from "../audit/mcp-oauth-startup-warnings.js";
import type { SecretStore } from "../stores/index.js";
import {
  createSecretStoreEmaConnectorRegistry,
  type EmaConnectorRegistry,
} from "./ema-connector-registry.js";
import {
  createIdJagIssuerService,
  fixedOrgMaterialResolver,
  type IdJagIssuerOrgMaterial,
  type IdJagIssuerService,
} from "./id-jag-issuer.js";
import {
  loadMcpOAuthSigningMaterialEffect,
  type McpOAuthSigningError,
  type McpOAuthSigningMaterial,
} from "./mcp-oauth-signing.js";

export type IdJagIssuerRuntime = {
  service: IdJagIssuerService["Type"];
  connectors: EmaConnectorRegistry;
  material: IdJagIssuerOrgMaterial;
};

function envFlag(name: string, env: NodeJS.ProcessEnv): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isIdJagIssuerEnabled(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(
    () =>
      envFlag("CLAWQL_ID_JAG_ISSUER_ENABLED", env) ||
      Boolean(
        env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM?.trim() ||
          env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH?.trim() ||
          env.CLAWQL_ID_JAG_ISSUER_SIGNING_SECRET?.trim()
      )
  );
}

/**
 * Build a single-org ID-JAG issuer from env when enabled.
 * Prefers dedicated issuer key material; falls back to MCP OAuth RS256/HS256 keys.
 */
export function createIdJagIssuerFromEnv(options: {
  env?: NodeJS.ProcessEnv;
  secretStore: SecretStore;
  eventSink?: AuthEventSink;
  /** Public origin used to derive jwksUri when unset. */
  publicOrigin?: string;
}): Effect.Effect<IdJagIssuerRuntime | null, McpOAuthSigningError> {
  return Effect.gen(function* () {
    const env = options.env ?? process.env;
    if (!(yield* isIdJagIssuerEnabled(env))) return null;

    yield* warnIfIdJagIssuerSharesMcpOAuthKey(env);

    const orgId = env.CLAWQL_ID_JAG_ISSUER_ORG_ID?.trim() || env.CLAWQL_DEFAULT_ORG_ID?.trim();
    if (!orgId) {
      return yield* Effect.dieMessage(
        "CLAWQL_ID_JAG_ISSUER_ENABLED requires CLAWQL_ID_JAG_ISSUER_ORG_ID (or CLAWQL_DEFAULT_ORG_ID)"
      );
    }

    const signing: McpOAuthSigningMaterial = yield* loadMcpOAuthSigningMaterialEffect({
      signingSecret:
        env.CLAWQL_ID_JAG_ISSUER_SIGNING_SECRET?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_SECRET?.trim(),
      privateKeyPem:
        env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM?.trim(),
      privateKeyPemPath:
        env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH?.trim(),
      publicKeyPem:
        env.CLAWQL_ID_JAG_ISSUER_PUBLIC_KEY_PEM?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PUBLIC_KEY_PEM?.trim(),
      publicKeyPemPath:
        env.CLAWQL_ID_JAG_ISSUER_PUBLIC_KEY_PEM_PATH?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PUBLIC_KEY_PEM_PATH?.trim(),
      keyId:
        env.CLAWQL_ID_JAG_ISSUER_KEY_ID?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_KEY_ID?.trim() ||
        "clawql-id-jag-issuer",
    });

    const publicOrigin = (
      options.publicOrigin ||
      env.CLAWQL_ID_JAG_ISSUER_ORIGIN?.trim() ||
      env.CLAWQL_PUBLIC_ORIGIN?.trim() ||
      "https://clawql.local"
    ).replace(/\/$/, "");

    const issuer = env.CLAWQL_ID_JAG_ISSUER_URI?.trim() || `${publicOrigin}/oauth/id-jag/${orgId}`;
    const jwksUri =
      env.CLAWQL_ID_JAG_ISSUER_JWKS_URI?.trim() ||
      `${publicOrigin}/.well-known/id-jag-jwks.json?orgId=${encodeURIComponent(orgId)}`;

    const material: IdJagIssuerOrgMaterial = {
      orgId,
      issuer,
      jwksUri,
      signing,
    };

    const connectors = createSecretStoreEmaConnectorRegistry(options.secretStore);
    const service = createIdJagIssuerService({
      connectors,
      resolveOrgMaterial: fixedOrgMaterialResolver(material),
      eventSink: options.eventSink ?? createAuthEventSinkFromEnv(env),
    });

    return { service, connectors, material };
  });
}

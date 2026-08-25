/**
 * Startup warnings for MCP OAuth deployments with risky configuration.
 * Effect-primary: every warner returns `Effect.Effect<void>` (`Effect.sync`).
 */

import { Effect } from "effect";

import { resolveAuthAuditStoreMode } from "./auth-worm.js";

export const MCP_OAUTH_AUDIT_DISABLED_WARNING =
  "[clawql-auth] SECURITY WARNING: CLAWQL_MCP_OAUTH_ENABLED=1 but CLAWQL_AUTH_AUDIT_STORE=off — " +
  "MCP token issuance is live but auth audit/WORM is disabled. " +
  "Every ID-JAG exchange and client_credentials grant will NOT be persisted for security review. " +
  "Set CLAWQL_AUTH_AUDIT_STORE=sqlite (default) before production deployment.";

export const MCP_OAUTH_HS256_ONLY_WARNING =
  "[clawql-auth] SECURITY WARNING: MCP OAuth AS is signing access tokens with HS256 " +
  "(CLAWQL_MCP_OAUTH_SIGNING_SECRET) and no RS256 private key is configured. " +
  "Resource servers and mcp-api-adapter cannot verify via JWKS; every verifier must hold the shared secret. " +
  "Production deployments should set CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM(_PATH) and publish /.well-known/jwks.json.";

function isMcpOAuthEnabledEnv(env: NodeJS.ProcessEnv): boolean {
  const enabledFlag = env.CLAWQL_MCP_OAUTH_ENABLED?.trim().toLowerCase();
  if (enabledFlag === "1" || enabledFlag === "true" || enabledFlag === "yes") return true;
  const legacyFlag = env.CLAWQL_MCP_OAUTH?.trim().toLowerCase();
  if (legacyFlag === "1" || legacyFlag === "true" || legacyFlag === "yes") return true;
  return Boolean(
    env.CLAWQL_MCP_OAUTH_SIGNING_SECRET?.trim() ||
      env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM?.trim() ||
      env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH?.trim()
  );
}

function hasRs256SigningMaterial(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM?.trim() ||
      env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH?.trim()
  );
}

function hasHs256SigningSecret(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.CLAWQL_MCP_OAUTH_SIGNING_SECRET?.trim());
}

/**
 * Log a loud warning when MCP OAuth is enabled without auth audit persistence.
 * Intended for `server-http` boot — not a debug line.
 */
export function warnIfMcpOAuthAuditDisabled(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void> {
  return Effect.sync(() => {
    if (!isMcpOAuthEnabledEnv(env)) return;
    if (resolveAuthAuditStoreMode(env) !== "off") return;
    console.warn(MCP_OAUTH_AUDIT_DISABLED_WARNING);
  });
}

/**
 * Warn when the AS will mint HS256 access tokens (shared secret) with no RS256 key.
 * Matches {@link loadMcpOAuthSigningFromEnvEffect}: RS256 PEM wins when both are set.
 */
export function warnIfMcpOAuthHs256Only(env: NodeJS.ProcessEnv = process.env): Effect.Effect<void> {
  return Effect.sync(() => {
    if (!isMcpOAuthEnabledEnv(env)) return;
    if (hasRs256SigningMaterial(env)) return;
    if (!hasHs256SigningSecret(env)) return;
    console.warn(MCP_OAUTH_HS256_ONLY_WARNING);
  });
}

export const ID_JAG_ISSUER_SHARED_KEY_WARNING =
  "[clawql-auth] SECURITY WARNING: ID-JAG issuer is using the MCP OAuth AS signing key " +
  "(no CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM(_PATH) / CLAWQL_ID_JAG_ISSUER_SIGNING_SECRET). " +
  "Compromise of one role forges both MCP access tokens and ID-JAG assertions. " +
  "Production deployments should configure a dedicated issuer key to limit blast radius.";

export const MCP_OAUTH_ADMIN_KEY_MISSING_WARNING =
  "[clawql-auth] SECURITY WARNING: MCP OAuth / ID-JAG issuer is enabled but CLAWQL_API_KEY is unset — " +
  "EMA org/connector admin routes and POST /oauth/id-jag/issue require CLAWQL_API_KEY and will return 503. " +
  "Set CLAWQL_API_KEY (or disable issuer/admin surfaces) before production.";

export const MCP_OAUTH_BOOTSTRAP_INVALID_WARNING =
  "[clawql-auth] SECURITY WARNING: MCP OAuth bootstrap config failed to load — " +
  "the configured CLAWQL_EMA_ORGS_* / CLAWQL_MCP_OAUTH_CLIENTS_* value was ignored (empty registry). " +
  "Fix the JSON/path or remove the env var; silent empty bootstrap leaves EMA/clients unconfigured.";

/**
 * Warn when the ID-JAG issuer falls back to MCP OAuth signing material.
 */
export function warnIfIdJagIssuerSharesMcpOAuthKey(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void> {
  return Effect.sync(() => {
    const hasDedicated = Boolean(
      env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM?.trim() ||
        env.CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM_PATH?.trim() ||
        env.CLAWQL_ID_JAG_ISSUER_SIGNING_SECRET?.trim()
    );
    if (hasDedicated) return;
    const hasMcpFallback = Boolean(
      env.CLAWQL_MCP_OAUTH_SIGNING_SECRET?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM?.trim() ||
        env.CLAWQL_MCP_OAUTH_SIGNING_PRIVATE_KEY_PEM_PATH?.trim()
    );
    if (!hasMcpFallback) return;
    console.warn(ID_JAG_ISSUER_SHARED_KEY_WARNING);
  });
}

/**
 * Warn when EMA/issuer admin routes cannot authenticate because CLAWQL_API_KEY is missing.
 */
export function warnIfMcpOAuthAdminKeyMissing(
  env: NodeJS.ProcessEnv = process.env,
  flags: { mcpOAuthEnabled?: boolean; idJagIssuerEnabled?: boolean } = {}
): Effect.Effect<void> {
  return Effect.sync(() => {
    if (!flags.mcpOAuthEnabled && !flags.idJagIssuerEnabled) return;
    if (env.CLAWQL_API_KEY?.trim()) return;
    console.warn(MCP_OAUTH_ADMIN_KEY_MISSING_WARNING);
  });
}

/** Warn when an explicit bootstrap env var was set but failed to parse/load. */
export function warnIfMcpOAuthBootstrapInvalid(
  source: string,
  cause?: unknown
): Effect.Effect<void> {
  return Effect.sync(() => {
    const detail = cause instanceof Error ? cause.message : cause ? String(cause) : "";
    console.warn(
      `${MCP_OAUTH_BOOTSTRAP_INVALID_WARNING} source=${source}` +
        (detail ? ` cause=${detail}` : "")
    );
  });
}

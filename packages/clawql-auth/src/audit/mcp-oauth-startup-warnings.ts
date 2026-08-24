/**
 * Startup warnings for MCP OAuth deployments with risky configuration.
 */

import { resolveAuthAuditStoreMode } from "./auth-worm.js";

export const MCP_OAUTH_AUDIT_DISABLED_WARNING =
  "[clawql-auth] SECURITY WARNING: CLAWQL_MCP_OAUTH_ENABLED=1 but CLAWQL_AUTH_AUDIT_STORE=off — " +
  "MCP token issuance is live but auth audit/WORM is disabled. " +
  "Every ID-JAG exchange and client_credentials grant will NOT be persisted for security review. " +
  "Set CLAWQL_AUTH_AUDIT_STORE=sqlite (default) before production deployment.";

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

/**
 * Log a loud warning when MCP OAuth is enabled without auth audit persistence.
 * Intended for `server-http` boot — not a debug line.
 */
export function warnIfMcpOAuthAuditDisabled(env: NodeJS.ProcessEnv = process.env): void {
  if (!isMcpOAuthEnabledEnv(env)) return;
  if (resolveAuthAuditStoreMode(env) !== "off") return;
  console.warn(MCP_OAUTH_AUDIT_DISABLED_WARNING);
}

export const ID_JAG_ISSUER_SHARED_KEY_WARNING =
  "[clawql-auth] SECURITY WARNING: ID-JAG issuer is using the MCP OAuth AS signing key " +
  "(no CLAWQL_ID_JAG_ISSUER_PRIVATE_KEY_PEM(_PATH) / CLAWQL_ID_JAG_ISSUER_SIGNING_SECRET). " +
  "Compromise of one role forges both MCP access tokens and ID-JAG assertions. " +
  "Production deployments should configure a dedicated issuer key to limit blast radius.";

/**
 * Warn when the ID-JAG issuer falls back to MCP OAuth signing material.
 */
export function warnIfIdJagIssuerSharesMcpOAuthKey(env: NodeJS.ProcessEnv = process.env): void {
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
}

/**
 * Thin Ready-safe surface for MCP gateway auth (apiKey / oidc / noAuth).
 * Import `clawql-auth/gateway` — not the package root — so listen does not
 * evaluate inbound MCP OAuth / SIWE (viem) / passkey AS routes.
 */
export {
  GatewayAuthError,
  resolveAuthMode,
  loadGatewayAuthConfig,
  defaultAdminAtrClaims,
  resolveAtrClaimsFromHeadersEffect,
  resolveAtrClaimsFromHeaders,
  assertGatewayAuthEffect,
  type AuthMode,
  type AtrClaims,
  type ApiKeyClaimsResolver,
  type GatewayAuthConfig,
  type AuthHeaderSource,
} from "../gateway.js";
export * from "../gateway-service.js";
export {
  OidcAuthError,
  loadOidcAuthConfig,
  resetOidcVerifyCaches,
  atrClaimsFromJwtPayload,
  assertOidcConfigReady,
  isOidcAuthEnabled,
  verifyOidcBearerTokenEffect,
  resolveOidcAtrClaimsFromHeadersEffect,
  type OidcAuthConfig,
} from "../oidc.js";
export * from "../oidc-service.js";
export {
  AuthPolicyError,
  DEFAULT_FINANCIAL_TOOL_NAMES,
  assertToolPolicyEffect,
  assertClaimsHaveMfaEffect,
  claimsHaveMfaEffect,
  isFinancialToolEffect,
  isMfaRequiredForFinancialToolsEffect,
  resolveFinancialToolNamesEffect,
  AuthPolicyService,
  authPolicyServiceFromEnv,
  AuthPolicyServiceLive,
  createAuthPolicyServiceLayer,
  extractEmailDomain,
  normalizeEmailDomain,
  assertEmailDomainAllowed,
  type AssertToolPolicyOptions,
  type EmailDomainPolicyOptions,
} from "../policy.js";
export { createClawQLAuth, type ClawQLAuth, type CreateClawQLAuthOptions } from "../create-auth.js";
export {
  emitAuthEventEffect,
  noopAuthEventSink,
  authEventSinkFromPromise,
  composeAuthEventSinks,
  type AuthEvent,
  type AuthEventSink,
} from "../audit/auth-events.js";
export {
  createAuthEventSinkFromEnv,
  resetAuthEventSinkCacheForTests,
} from "../audit/auth-worm-sink.js";
export {
  MCP_OAUTH_AUDIT_DISABLED_WARNING,
  MCP_OAUTH_HS256_ONLY_WARNING,
  MCP_OAUTH_ADMIN_KEY_MISSING_WARNING,
  MCP_OAUTH_BOOTSTRAP_INVALID_WARNING,
  ID_JAG_ISSUER_SHARED_KEY_WARNING,
  warnIfMcpOAuthAuditDisabled,
  warnIfMcpOAuthHs256Only,
  warnIfMcpOAuthAdminKeyMissing,
  warnIfMcpOAuthBootstrapInvalid,
  warnIfIdJagIssuerSharesMcpOAuthKey,
} from "../audit/mcp-oauth-startup-warnings.js";
export * from "../api-keys/index.js";
export {
  resolveSecretStore,
  resolveSecretStoreKind,
  resolveSecretStoreKindEffect,
  type ResolveSecretStoreOptions,
} from "../stores/index.js";
export type { SecretStore, SecretStoreKind } from "../stores/index.js";

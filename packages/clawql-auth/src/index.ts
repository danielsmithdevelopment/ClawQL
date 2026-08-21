/**
 * clawql-auth public API — Effect-first.
 *
 * Only Effect functions, Layers, services, typed errors, config/predicate helpers, and types are
 * exported. Sync throwing / Promise façades are intentionally not part of the package surface;
 * hosts run the Effect APIs with `Effect.runSync` / `Effect.runPromise` at their own boundary.
 */

export {
  GatewayAuthError,
  resolveAuthMode,
  loadGatewayAuthConfig,
  defaultAdminAtrClaims,
  resolveAtrClaimsFromHeadersEffect,
  assertGatewayAuthEffect,
  type AuthMode,
  type AtrClaims,
  type ApiKeyClaimsResolver,
  type GatewayAuthConfig,
  type AuthHeaderSource,
} from "./gateway.js";
export * from "./gateway-service.js";
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
} from "./oidc.js";
export * from "./oidc-service.js";
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
} from "./policy.js";
export * from "./org-idp-routing.js";
export * from "./create-auth.js";
export * from "./auth-layer.js";
export * from "./step-up/index.js";
export {
  mergedAuthHeadersEffect,
  isGoogleDiscoverySpecLabelEffect,
  ProviderAuthHeadersService,
  ProviderAuthHeadersServiceLive,
} from "./provider-auth-headers.js";
export {
  AwsAuthError,
  isAwsSpecLabelEffect,
  resolveAwsCredentialsEffect,
  resolveAwsRegionEffect,
  resolveAwsServiceNameEffect,
  resolveAwsApiBaseUrlEffect,
  applyAwsQueryActionPathEffect,
  awsSigningHostEffect,
  AwsAuthHelpers,
  AwsAuthHelpersLive,
  type AwsCredentials,
} from "./aws-auth.js";
export {
  AwsSigV4Error,
  maybeSignAwsRequestEffect,
  normalizeAwsExecuteUrlEffect,
  AwsSigV4Service,
  AwsSigV4ServiceLive,
  type AwsSignableRequestInit,
} from "./aws-sigv4.js";
export {
  emitAuthEvent,
  noopAuthEventSink,
  type AuthEvent,
  type AuthEventSink,
} from "./audit/auth-events.js";
export * from "./api-keys/index.js";
export * from "./oauth/index.js";
export * from "./inbound/index.js";
export * from "./stores/index.js";

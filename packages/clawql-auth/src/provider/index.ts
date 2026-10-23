/**
 * Thin execute-path surface: provider auth headers + AWS SigV4 helpers.
 * Import `clawql-auth/provider` from clawql-api execute/spec — not the package
 * root — so REST execute does not evaluate inbound OAuth / SIWE.
 */
export {
  mergedAuthHeadersEffect,
  isGoogleDiscoverySpecLabelEffect,
  ProviderAuthHeadersService,
  ProviderAuthHeadersServiceLive,
} from "../provider-auth-headers.js";
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
} from "../aws-auth.js";
export {
  AwsSigV4Error,
  maybeSignAwsRequestEffect,
  normalizeAwsExecuteUrlEffect,
  AwsSigV4Service,
  AwsSigV4ServiceLive,
  type AwsSignableRequestInit,
} from "../aws-sigv4.js";

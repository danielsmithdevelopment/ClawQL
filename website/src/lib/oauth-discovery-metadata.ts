/**
 * OAuth 2.0 / OpenID Connect discovery documents for `/.well-known/*`.
 * Defaults follow Google Accounts (common for ClawQL upstream API tokens); override via env when
 * the site fronts another authorization server (e.g. Cloudflare Access).
 *
 * @see http://openid.net/specs/openid-connect-discovery-1_0.html
 * @see https://www.rfc-editor.org/rfc/rfc8414
 * @see https://www.rfc-editor.org/rfc/rfc9728
 */

import { getSiteOrigin } from '@/lib/site-url'

/** Google OIDC discovery as of 2025 (stable endpoints); overridden per-field by env when set. */
const GOOGLE_OIDC_BASE: Record<string, unknown> = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  device_authorization_endpoint: 'https://oauth2.googleapis.com/device/code',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
  revocation_endpoint: 'https://oauth2.googleapis.com/revoke',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  response_types_supported: [
    'code',
    'token',
    'id_token',
    'code token',
    'code id_token',
    'token id_token',
    'code token id_token',
    'none',
  ],
  response_modes_supported: ['query', 'fragment', 'form_post'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['openid', 'email', 'profile'],
  token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
  claims_supported: [
    'aud',
    'email',
    'email_verified',
    'exp',
    'family_name',
    'given_name',
    'iat',
    'iss',
    'name',
    'picture',
    'sub',
  ],
  code_challenge_methods_supported: ['plain', 'S256'],
  grant_types_supported: [
    'authorization_code',
    'refresh_token',
    'urn:ietf:params:oauth:grant-type:device_code',
    'urn:ietf:params:oauth:grant-type:jwt-bearer',
  ],
  authorization_response_iss_parameter_supported: true,
}

function envString(key: string): string | undefined {
  const v = process.env[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

/**
 * OpenID Provider metadata (`/.well-known/openid-configuration`).
 */
export function getOpenIdConfiguration(): Record<string, unknown> {
  const doc = { ...GOOGLE_OIDC_BASE }
  const issuer = envString('OIDC_DISCOVERY_ISSUER')
  const authorization = envString('OIDC_DISCOVERY_AUTHORIZATION_ENDPOINT')
  const token = envString('OIDC_DISCOVERY_TOKEN_ENDPOINT')
  const jwks = envString('OIDC_DISCOVERY_JWKS_URI')
  const userinfo = envString('OIDC_DISCOVERY_USERINFO_ENDPOINT')
  const revocation = envString('OIDC_DISCOVERY_REVOCATION_ENDPOINT')
  if (issuer) doc.issuer = issuer
  if (authorization) doc.authorization_endpoint = authorization
  if (token) doc.token_endpoint = token
  if (jwks) doc.jwks_uri = jwks
  if (userinfo) doc.userinfo_endpoint = userinfo
  if (revocation) doc.revocation_endpoint = revocation
  return doc
}

/**
 * OAuth 2.0 Authorization Server metadata (`/.well-known/oauth-authorization-server`).
 * RFC 8414 allows a focused subset; we include the same endpoints and grant/response types.
 */
export function getOAuthAuthorizationServerMetadata(): Record<string, unknown> {
  const oidc = getOpenIdConfiguration()
  return {
    issuer: oidc.issuer,
    authorization_endpoint: oidc.authorization_endpoint,
    token_endpoint: oidc.token_endpoint,
    jwks_uri: oidc.jwks_uri,
    revocation_endpoint: oidc.revocation_endpoint,
    device_authorization_endpoint: oidc.device_authorization_endpoint,
    scopes_supported: oidc.scopes_supported,
    response_types_supported: oidc.response_types_supported,
    grant_types_supported: oidc.grant_types_supported,
    token_endpoint_auth_methods_supported: oidc.token_endpoint_auth_methods_supported,
    code_challenge_methods_supported: oidc.code_challenge_methods_supported,
  }
}

function authorizationServersForProtectedResource(
  issuer: string,
): string[] {
  const list = envString('OAUTH_PR_AUTHORIZATION_SERVERS')
  if (list) {
    const parsed = list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parsed.length > 0) return parsed
  }
  return [issuer]
}

function scopesForProtectedResource(
  oidcScopes: string[] | undefined,
): string[] {
  const list = envString('OAUTH_PR_SCOPES_SUPPORTED')
  if (list) {
    const parsed = list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parsed.length > 0) return parsed
  }
  return oidcScopes ?? []
}

/**
 * OAuth 2.0 Protected Resource metadata (`/.well-known/oauth-protected-resource`).
 * `resource` is this deployment’s origin so it matches RFC 9728 §3.3 validation for the default path.
 */
export function getOAuthProtectedResourceMetadata(): Record<string, unknown> {
  const oidc = getOpenIdConfiguration()
  const issuer = String(oidc.issuer ?? 'https://accounts.google.com')
  const resource = getSiteOrigin().origin.replace(/\/$/, '')

  return {
    resource,
    authorization_servers: authorizationServersForProtectedResource(issuer),
    scopes_supported: scopesForProtectedResource(
      oidc.scopes_supported as string[] | undefined,
    ),
    bearer_methods_supported: ['header'],
    resource_name: envString('OAUTH_PR_RESOURCE_NAME') ?? 'ClawQL',
    resource_documentation:
      envString('OAUTH_PR_RESOURCE_DOCUMENTATION') ??
      `${resource}/spec-configuration`,
  }
}

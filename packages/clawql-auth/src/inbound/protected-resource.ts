/**
 * MCP OAuth protected-resource discovery (RFC 9728) + 401 challenge helpers.
 * Effect-primary: URL/header builders as `Effect.sync` for the Effect-everywhere rule.
 */

import { Context, Effect, Layer } from "effect";

export const MCP_OAUTH_PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";

export type McpProtectedResourceMetadataInput = {
  /** Canonical protected resource identifier (usually the MCP URL). */
  readonly resource: string;
  /** Authorization server issuer URL(s). */
  readonly authorizationServers: readonly string[];
  readonly scopesSupported?: readonly string[];
  readonly resourceName?: string;
  readonly resourceDocumentation?: string;
  readonly bearerMethodsSupported?: readonly string[];
};

export type McpProtectedResourceMetadata = {
  readonly resource: string;
  readonly authorization_servers: string[];
  readonly scopes_supported: string[];
  readonly bearer_methods_supported: string[];
  readonly resource_name?: string;
  readonly resource_documentation?: string;
};

/** Build RFC 9728 protected-resource metadata JSON body. */
export function buildMcpProtectedResourceMetadataEffect(
  input: McpProtectedResourceMetadataInput
): Effect.Effect<McpProtectedResourceMetadata> {
  return Effect.sync(() => {
    const resource = input.resource.replace(/\/$/, "") || input.resource;
    const authorization_servers = input.authorizationServers
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
    const scopes_supported = [...(input.scopesSupported ?? ["execute", "search", "memory", "mcp:tools"])];
    const bearer_methods_supported = [
      ...(input.bearerMethodsSupported ?? ["header"]),
    ];
    return {
      resource,
      authorization_servers,
      scopes_supported,
      bearer_methods_supported,
      ...(input.resourceName ? { resource_name: input.resourceName } : {}),
      ...(input.resourceDocumentation
        ? { resource_documentation: input.resourceDocumentation }
        : {}),
    };
  });
}

export type McpWwwAuthenticateInput = {
  /** Absolute URL of the protected-resource metadata document. */
  readonly resourceMetadataUrl: string;
  /** Optional RFC 6750 `error` (e.g. `invalid_token`). */
  readonly error?: string;
  readonly errorDescription?: string;
  readonly scope?: string;
};

/**
 * `WWW-Authenticate` value for unauthenticated MCP requests.
 * Includes `resource_metadata` so clients can discover the AS (MCP OAuth).
 */
export function buildMcpWwwAuthenticateHeaderEffect(
  input: McpWwwAuthenticateInput
): Effect.Effect<string> {
  return Effect.sync(() => {
    const parts = [`Bearer resource_metadata="${input.resourceMetadataUrl}"`];
    if (input.error?.trim()) parts.push(`error="${input.error.trim()}"`);
    if (input.errorDescription?.trim()) {
      const desc = input.errorDescription.trim().replace(/"/g, "'");
      parts.push(`error_description="${desc}"`);
    }
    if (input.scope?.trim()) parts.push(`scope="${input.scope.trim()}"`);
    return parts.join(", ");
  });
}

/** Resolve absolute origin from proto + host (gateway / Express). */
export function resolvePublicOriginEffect(input: {
  readonly proto?: string;
  readonly host?: string;
}): Effect.Effect<string> {
  return Effect.sync(() => {
    const proto = (input.proto?.trim() || "http").replace(/:$/, "");
    const host = input.host?.trim() || "localhost";
    return `${proto}://${host}`.replace(/\/$/, "");
  });
}

/**
 * Canonical MCP resource identifier for this deployment.
 * Prefer explicit audience/resource env; else `{origin}{mcpPath}`.
 */
export function resolveMcpResourceIdentifierEffect(input: {
  readonly origin: string;
  readonly mcpPath?: string;
  readonly configuredResource?: string;
}): Effect.Effect<string> {
  return Effect.sync(() => {
    const configured = input.configuredResource?.trim();
    if (configured) return configured.replace(/\/$/, "") || configured;
    const path = input.mcpPath?.trim() || "/mcp";
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${input.origin.replace(/\/$/, "")}${normalizedPath}`;
  });
}

/** Normalize resource / audience identifiers for comparison (strip one trailing slash). */
export function normalizeResourceIdEffect(value: string): Effect.Effect<string> {
  return Effect.sync(() => {
    const trimmed = value.trim();
    return trimmed.replace(/\/$/, "") || trimmed;
  });
}

/**
 * RFC 8707: requested `resource` must match the server's canonical resource when both set.
 * Returns the audience to mint (`canonical` preferred when request omits `resource`).
 */
export function resolveTokenAudienceEffect(
  requested: string | undefined,
  canonical: string | undefined
): Effect.Effect<string | undefined, { readonly _tag: "resource_mismatch" }> {
  return Effect.gen(function* () {
    const req = requested?.trim();
    const canon = canonical?.trim();
    if (!req) return canon || undefined;
    if (!canon) return req;
    const a = yield* normalizeResourceIdEffect(req);
    const b = yield* normalizeResourceIdEffect(canon);
    if (a !== b) {
      return yield* Effect.fail({ _tag: "resource_mismatch" as const });
    }
    return b;
  });
}

/** Sync-safe resource match (tests / thin hosts). Prefer {@link resolveTokenAudienceEffect}. */
export function resourcesMatch(requested: string, canonical: string): boolean {
  const a = requested.trim().replace(/\/$/, "") || requested.trim();
  const b = canonical.trim().replace(/\/$/, "") || canonical.trim();
  return a.length > 0 && a === b;
}

export const CLAWQL_MCP_PROTECTED_RESOURCE_TAG = "clawql/McpProtectedResourceService" as const;

export class McpProtectedResourceService extends Context.Service<
  typeof CLAWQL_MCP_PROTECTED_RESOURCE_TAG,
  {
    readonly buildMetadata: (
      input: McpProtectedResourceMetadataInput
    ) => Effect.Effect<McpProtectedResourceMetadata>;
    readonly buildWwwAuthenticate: (
      input: McpWwwAuthenticateInput
    ) => Effect.Effect<string>;
    readonly resolvePublicOrigin: (input: {
      readonly proto?: string;
      readonly host?: string;
    }) => Effect.Effect<string>;
    readonly resolveResourceIdentifier: (input: {
      readonly origin: string;
      readonly mcpPath?: string;
      readonly configuredResource?: string;
    }) => Effect.Effect<string>;
  }
>()(CLAWQL_MCP_PROTECTED_RESOURCE_TAG) {}

export const McpProtectedResourceLive = Layer.succeed(McpProtectedResourceService, {
  buildMetadata: buildMcpProtectedResourceMetadataEffect,
  buildWwwAuthenticate: buildMcpWwwAuthenticateHeaderEffect,
  resolvePublicOrigin: resolvePublicOriginEffect,
  resolveResourceIdentifier: resolveMcpResourceIdentifierEffect,
});

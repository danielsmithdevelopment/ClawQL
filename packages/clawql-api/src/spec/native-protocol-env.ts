/**
 * Parse JSON env for custom provider endpoints (GraphQL HTTP, gRPC).
 * Users declare providers; ClawQL picks gRPC → GraphQL → OpenAPI internally.
 *
 * @see docs/adr/0002-multi-protocol-supergraph.md
 */

import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  resolveBundledGraphqlByEndpoint,
  type BundledGraphqlProvider,
} from "./provider-registry.js";

export interface GraphQLSourceConfig {
  /** Short label for operation ids and `mergedAuthHeadersEffect(name)`. */
  name: string;
  /** GraphQL HTTP endpoint (`execute` POST target). Required even when the index is built from disk (introspection disabled upstream). */
  endpoint: string;
  /** Optional static headers (merged; override same keys from `mergedAuthHeadersEffect`). */
  headers?: Record<string, string>;
  /**
   * Path to `.graphql` / `.gql` SDL on disk — builds the operation index without live introspection.
   * Ignored if **`introspectionPath`** is set (introspection file wins).
   */
  schemaPath?: string;
  /**
   * Path to saved introspection JSON (`buildClientSchema`) — same shape as GraphQL introspection **`data`** or a root **`{ "__schema": … }`** export.
   */
  introspectionPath?: string;
  /**
   * Inline SDL (not set via env JSON). Used when loading bundled GraphQL providers from a fetched fallback.
   */
  schemaContent?: string;
}

export interface GrpcSourceConfig {
  name: string;
  /** gRPC `host:port` (no scheme). */
  endpoint: string;
  /** Path to `.proto` file (cwd-relative or absolute). */
  protoPath: string;
  /**
   * Use plaintext (`grpc.credentials.createInsecure()`). Omit or `false` for TLS
   * (`grpc.credentials.createSsl()`).
   */
  insecure?: boolean;
}

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v.trim();
}

/** True when the user selected bundled providers via OpenAPI/Discovery/spec env. */
export function wantsOpenAPISpecSelectionEnv(): boolean {
  return !!(
    process.env.CLAWQL_SPEC_PATH?.trim() ||
    process.env.OPENAPI_SPEC_PATH?.trim() ||
    process.env.OPENAPI_FILE?.trim() ||
    process.env.CLAWQL_SPEC_URL?.trim() ||
    process.env.CLAWQL_DISCOVERY_URL?.trim() ||
    process.env.CLAWQL_SPEC_PATHS?.trim() ||
    process.env.CLAWQL_BUNDLED_PROVIDERS?.trim() ||
    process.env.CLAWQL_PROVIDER?.trim()
  );
}

function parseOptionalJsonHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o !== "object" || o === null || Array.isArray(o)) {
      console.error("[spec-loader] CLAWQL_GRAPHQL_HEADERS: expected a JSON object");
      return undefined;
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v.trim()) headers[k] = v.trim();
    }
    return Object.keys(headers).length ? headers : undefined;
  } catch (e) {
    console.error("[spec-loader] CLAWQL_GRAPHQL_HEADERS: invalid JSON", e);
    return undefined;
  }
}

function parseJsonArrayEnv(raw: string | undefined, envName: string): unknown[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.error(`[spec-loader] ${envName}: expected a JSON array`);
      return [];
    }
    return parsed;
  } catch (e) {
    console.error(`[spec-loader] ${envName}: invalid JSON`, e);
    return [];
  }
}

function pathExistsOnDisk(pathRel: string): boolean {
  return existsSync(resolvePath(process.cwd(), pathRel));
}

/** Drop missing on-disk schema hints; fall back to HTTP introspection with a clear log line. */
function sanitizeGraphQLDiskPaths(
  name: string,
  schemaPath: string | undefined,
  introspectionPath: string | undefined
): { schemaPath?: string; introspectionPath?: string } {
  let schema = schemaPath;
  let intro = introspectionPath;
  if (intro && !pathExistsOnDisk(intro)) {
    console.error(
      `[spec-loader] Provider "${name}": introspectionPath not found (${resolvePath(process.cwd(), intro)}); trying HTTP introspection instead`
    );
    intro = undefined;
  }
  if (schema && !pathExistsOnDisk(schema)) {
    console.error(
      `[spec-loader] Provider "${name}": schemaPath not found (${resolvePath(process.cwd(), schema)}); trying HTTP introspection instead`
    );
    schema = undefined;
  }
  return {
    ...(schema ? { schemaPath: schema } : {}),
    ...(intro ? { introspectionPath: intro } : {}),
  };
}

export function parseGraphQLSourcesEnv(): GraphQLSourceConfig[] {
  const arr = parseJsonArrayEnv(process.env.CLAWQL_GRAPHQL_SOURCES, "CLAWQL_GRAPHQL_SOURCES");
  const out: GraphQLSourceConfig[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const name = asNonEmptyString(o.name);
    const endpoint = asNonEmptyString(o.endpoint);
    if (!name || !endpoint) {
      console.error("[spec-loader] CLAWQL_GRAPHQL_SOURCES entry skipped (need name + endpoint)");
      continue;
    }
    let headers: Record<string, string> | undefined;
    if (o.headers !== undefined) {
      if (typeof o.headers !== "object" || o.headers === null || Array.isArray(o.headers)) {
        console.error(`[spec-loader] Provider "${name}": headers must be a JSON object`);
      } else {
        headers = {};
        for (const [k, v] of Object.entries(o.headers as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim()) headers[k] = v.trim();
        }
      }
    }
    const schemaPath = asNonEmptyString(o.schemaPath);
    const introspectionPath = asNonEmptyString(o.introspectionPath);
    const disk = sanitizeGraphQLDiskPaths(name, schemaPath, introspectionPath);
    out.push({ name, endpoint, headers, ...disk });
  }

  const singleUrl = process.env.CLAWQL_GRAPHQL_URL?.trim();
  if (singleUrl) {
    const name = process.env.CLAWQL_GRAPHQL_NAME?.trim() || "graphql";
    const headers = parseOptionalJsonHeaders(process.env.CLAWQL_GRAPHQL_HEADERS);
    const schemaPath = process.env.CLAWQL_GRAPHQL_SCHEMA_PATH?.trim();
    const introspectionPath = process.env.CLAWQL_GRAPHQL_INTROSPECTION_PATH?.trim();
    const disk = sanitizeGraphQLDiskPaths(name, schemaPath, introspectionPath);
    out.push({
      name,
      endpoint: singleUrl,
      headers,
      ...disk,
    });
  }

  return out;
}

/** True when custom provider endpoints are configured via GraphQL/gRPC env. */
export function hasCustomProviderEnv(): boolean {
  return parseGraphQLSourcesEnv().length > 0 || parseGrpcSourcesEnv().length > 0;
}

/** @deprecated Use {@link hasCustomProviderEnv}. */
export const hasNativeProtocolEnv = hasCustomProviderEnv;

/**
 * User configured custom provider endpoint(s) without `CLAWQL_PROVIDER` / spec paths —
 * load only those providers (not the default Cloudflare/GitHub/… stack).
 */
export function shouldLoadCustomProvidersOnly(): boolean {
  return hasCustomProviderEnv() && !wantsOpenAPISpecSelectionEnv();
}

/** @deprecated Use {@link shouldLoadCustomProvidersOnly}. */
export const shouldLoadNativeProtocolsOnlyMode = shouldLoadCustomProvidersOnly;

/**
 * When a single custom GraphQL endpoint matches a bundled provider, route through the
 * bundled connection (best known path) instead of live introspection.
 */
export function resolveBundledGraphqlFromCustomEnv(): BundledGraphqlProvider | null {
  if (wantsOpenAPISpecSelectionEnv()) return null;
  if (parseGrpcSourcesEnv().length > 0) return null;
  const gql = parseGraphQLSourcesEnv();
  if (gql.length !== 1) return null;
  const bundled = resolveBundledGraphqlByEndpoint(gql[0]!.endpoint);
  if (!bundled) return null;
  console.error(
    `[spec-loader] Provider endpoint ${gql[0]!.endpoint} → bundled "${bundled.id}" (best available connection)`
  );
  return bundled;
}

export function parseGrpcSourcesEnv(): GrpcSourceConfig[] {
  const arr = parseJsonArrayEnv(process.env.CLAWQL_GRPC_SOURCES, "CLAWQL_GRPC_SOURCES");
  const out: GrpcSourceConfig[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const name = asNonEmptyString(o.name);
    const endpoint = asNonEmptyString(o.endpoint);
    const protoPath = asNonEmptyString(o.protoPath);
    if (!name || !endpoint || !protoPath) {
      console.error(
        "[spec-loader] CLAWQL_GRPC_SOURCES entry skipped (need name, endpoint, protoPath)"
      );
      continue;
    }
    if (!pathExistsOnDisk(protoPath)) {
      console.error(
        `[spec-loader] Provider "${name}": protoPath not found (${resolvePath(process.cwd(), protoPath)}); entry skipped`
      );
      continue;
    }
    const insecure = o.insecure === true ? true : o.insecure === false ? false : undefined;
    out.push({ name, endpoint, protoPath, insecure });
  }
  return out;
}

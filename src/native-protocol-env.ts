/**
 * Parse JSON env for first-class GraphQL and gRPC sources (clawql-mcp 5.0.0+).
 *
 * @see docs/adr/0002-multi-protocol-supergraph.md
 */

export interface GraphQLSourceConfig {
  /** Short label for operation ids and `mergedAuthHeaders(name)`. */
  name: string;
  /** GraphQL HTTP endpoint (`execute` POST target). Required even when the index is built from disk (introspection disabled upstream). */
  endpoint: string;
  /** Optional static headers (merged; override same keys from `mergedAuthHeaders`). */
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

/** True when any OpenAPI / Discovery / bundled selection env is set (anything that would load REST/OpenAPI operations). */
export function wantsOpenAPISpecSelectionEnv(): boolean {
  return !!(
    process.env.CLAWQL_SPEC_PATH?.trim() ||
    process.env.OPENAPI_SPEC_PATH?.trim() ||
    process.env.OPENAPI_FILE?.trim() ||
    process.env.CLAWQL_SPEC_URL?.trim() ||
    process.env.OPENAPI_SPEC_URL?.trim() ||
    process.env.CLAWQL_DISCOVERY_URL?.trim() ||
    process.env.GOOGLE_DISCOVERY_URL?.trim() ||
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
      console.error("[native-protocol] CLAWQL_GRAPHQL_HEADERS: expected a JSON object");
      return undefined;
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && v.trim()) headers[k] = v.trim();
    }
    return Object.keys(headers).length ? headers : undefined;
  } catch (e) {
    console.error("[native-protocol] CLAWQL_GRAPHQL_HEADERS: invalid JSON", e);
    return undefined;
  }
}

function parseJsonArrayEnv(raw: string | undefined, envName: string): unknown[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.error(`[native-protocol] ${envName}: expected a JSON array`);
      return [];
    }
    return parsed;
  } catch (e) {
    console.error(`[native-protocol] ${envName}: invalid JSON`, e);
    return [];
  }
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
      console.error(
        "[native-protocol] CLAWQL_GRAPHQL_SOURCES entry skipped (need name + endpoint)"
      );
      continue;
    }
    let headers: Record<string, string> | undefined;
    if (o.headers !== undefined) {
      if (typeof o.headers !== "object" || o.headers === null || Array.isArray(o.headers)) {
        console.error(`[native-protocol] GraphQL source "${name}": headers must be a JSON object`);
      } else {
        headers = {};
        for (const [k, v] of Object.entries(o.headers as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim()) headers[k] = v.trim();
        }
      }
    }
    const schemaPath = asNonEmptyString(o.schemaPath);
    const introspectionPath = asNonEmptyString(o.introspectionPath);
    out.push({ name, endpoint, headers, schemaPath, introspectionPath });
  }

  /** Same idea as `CLAWQL_SPEC_URL` for OpenAPI — one HTTP GraphQL endpoint (e.g. Linear). Appended after JSON array entries. */
  const singleUrl = process.env.CLAWQL_GRAPHQL_URL?.trim();
  if (singleUrl) {
    const name = process.env.CLAWQL_GRAPHQL_NAME?.trim() || "graphql";
    const headers = parseOptionalJsonHeaders(process.env.CLAWQL_GRAPHQL_HEADERS);
    const schemaPath = process.env.CLAWQL_GRAPHQL_SCHEMA_PATH?.trim();
    const introspectionPath = process.env.CLAWQL_GRAPHQL_INTROSPECTION_PATH?.trim();
    out.push({
      name,
      endpoint: singleUrl,
      headers,
      ...(schemaPath ? { schemaPath } : {}),
      ...(introspectionPath ? { introspectionPath } : {}),
    });
  }

  return out;
}

/** True when GraphQL (URL / SOURCES) or gRPC SOURCES are configured with at least one effective source. */
export function hasNativeProtocolEnv(): boolean {
  return parseGraphQLSourcesEnv().length > 0 || parseGrpcSourcesEnv().length > 0;
}

/** Load only native GraphQL/gRPC operations — no bundled OpenAPI default (Cloudflare / all-providers). */
export function shouldLoadNativeProtocolsOnlyMode(): boolean {
  return hasNativeProtocolEnv() && !wantsOpenAPISpecSelectionEnv();
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
        "[native-protocol] CLAWQL_GRPC_SOURCES entry skipped (need name, endpoint, protoPath)"
      );
      continue;
    }
    const insecure = o.insecure === true ? true : o.insecure === false ? false : undefined;
    out.push({ name, endpoint, protoPath, insecure });
  }
  return out;
}

/**
 * Builds a live GraphQL schema from OpenAPI 3 via **@omnigraph/openapi**
 * (GraphQL Mesh OpenAPI handler). Resolvers proxy to upstream REST with auth headers.
 *
 * Schemas are cached per (openapi object identity × baseUrl × auth headers) so
 * hot-path `execute` does not rebuild Omnigraph on every call (~5–6ms on a tiny spec).
 */

import { Effect } from "effect";
import type { GraphQLSchema } from "graphql";
import { mergedAuthHeadersEffect } from "../auth/auth-headers.js";
import { getPackageRoot } from "../spec/package-root.js";

/** Lazy Omnigraph — keep REST-prefer / equal-arm boots off the Mesh RSS tax. */
function loadOmnigraphOpenApiEffect(): Effect.Effect<
  typeof import("@omnigraph/openapi").default,
  Error
> {
  return Effect.tryPromise({
    try: async () => {
      const mod = await import("@omnigraph/openapi");
      return mod.default;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

interface SchemaResult {
  schema: GraphQLSchema;
  contextValue: Record<string, unknown>;
}

const openapiIdentity = new WeakMap<object, number>();
let nextOpenapiId = 1;
const schemaCache = new Map<string, SchemaResult>();
/** In-flight builds keyed the same as {@link schemaCache} (single-flight). */
const schemaInFlight = new Map<string, Promise<SchemaResult>>();

function openapiCacheId(openapi: object): number {
  let id = openapiIdentity.get(openapi);
  if (id === undefined) {
    id = nextOpenapiId++;
    openapiIdentity.set(openapi, id);
  }
  return id;
}

function schemaCacheKey(openapi: object, baseUrl: string, headers: Record<string, string>): string {
  const hdr = Object.keys(headers)
    .sort()
    .map((k) => `${k}=${headers[k]}`)
    .join("&");
  return `${openapiCacheId(openapi)}\0${baseUrl}\0${hdr}`;
}

/** Drop cached Omnigraph schemas (tests / auth rotation). */
export function resetGraphQLSchemaCacheEffect(): Effect.Effect<void> {
  return Effect.sync(() => {
    schemaCache.clear();
    schemaInFlight.clear();
  });
}

/** Promise façade for tests and host boundaries. */
export function resetGraphQLSchemaCache(): void {
  Effect.runSync(resetGraphQLSchemaCacheEffect());
}

async function buildGraphQLSchemaImpl(openapi: object, baseUrl: string): Promise<SchemaResult> {
  const headers = Effect.runSync(mergedAuthHeadersEffect());
  const key = schemaCacheKey(openapi, baseUrl, headers);
  const hit = schemaCache.get(key);
  if (hit) return hit;

  const pending = schemaInFlight.get(key);
  if (pending) return pending;

  const build = (async (): Promise<SchemaResult> => {
    const loadGraphQLSchemaFromOpenAPI = await Effect.runPromise(loadOmnigraphOpenApiEffect());
    const schema = await loadGraphQLSchemaFromOpenAPI("ClawQL", {
      source: openapi as never,
      endpoint: baseUrl,
      cwd: getPackageRoot(),
      operationHeaders: Object.keys(headers).length > 0 ? headers : undefined,
      ignoreErrorResponses: true,
    });
    const result: SchemaResult = { schema, contextValue: {} };
    schemaCache.set(key, result);
    return result;
  })();

  schemaInFlight.set(key, build);
  try {
    return await build;
  } finally {
    schemaInFlight.delete(key);
  }
}

export function buildGraphQLSchemaEffect(
  openapi: object,
  baseUrl: string
): Effect.Effect<SchemaResult, Error> {
  return Effect.tryPromise({
    try: () => buildGraphQLSchemaImpl(openapi, baseUrl),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link buildGraphQLSchemaEffect} for Effect callers. */
export async function buildGraphQLSchema(openapi: object, baseUrl: string): Promise<SchemaResult> {
  return Effect.runPromise(buildGraphQLSchemaEffect(openapi, baseUrl));
}

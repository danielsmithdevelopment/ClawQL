/**
 * Builds a live GraphQL schema from OpenAPI 3 via **@omnigraph/openapi**
 * (GraphQL Mesh OpenAPI handler). Resolvers proxy to upstream REST with auth headers.
 */

import loadGraphQLSchemaFromOpenAPI from "@omnigraph/openapi";
import { Effect } from "effect";
import type { GraphQLSchema } from "graphql";
import { mergedAuthHeadersEffect } from "../auth/auth-headers.js";
import { getPackageRoot } from "../spec/package-root.js";

interface SchemaResult {
  schema: GraphQLSchema;
  contextValue: Record<string, unknown>;
}

async function buildGraphQLSchemaImpl(openapi: object, baseUrl: string): Promise<SchemaResult>  {
  const headers = Effect.runSync(mergedAuthHeadersEffect());

  const schema = await loadGraphQLSchemaFromOpenAPI("ClawQL", {
    source: openapi as never,
    endpoint: baseUrl,
    cwd: getPackageRoot(),
    operationHeaders: Object.keys(headers).length > 0 ? headers : undefined,
    ignoreErrorResponses: true,
  });

  return { schema, contextValue: {} };
}

export function buildGraphQLSchemaEffect(openapi: object, baseUrl: string): Effect.Effect<SchemaResult, Error> {
  return Effect.tryPromise({
    try: () => buildGraphQLSchemaImpl(openapi, baseUrl),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link buildGraphQLSchemaEffect} for Effect callers. */
export async function buildGraphQLSchema(openapi: object, baseUrl: string): Promise<SchemaResult>  {
  return Effect.runPromise(buildGraphQLSchemaEffect(openapi, baseUrl));
}

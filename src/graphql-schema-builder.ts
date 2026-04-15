/**
 * graphql-schema-builder.ts
 *
 * Builds a live GraphQL schema from OpenAPI 3 via **@omnigraph/openapi**
 * (the same stack as [GraphQL Mesh OpenAPI](https://the-guild.dev/graphql/mesh/docs/handlers/openapi)).
 * Resolvers proxy to the upstream REST API with headers from
 * CLAWQL_HTTP_HEADERS and bearer selection (see auth-headers.ts).
 */

import loadGraphQLSchemaFromOpenAPI from "@omnigraph/openapi";
import type { GraphQLSchema } from "graphql";
import { mergedAuthHeaders } from "./auth-headers.js";
import { getPackageRoot } from "./package-root.js";

interface SchemaResult {
  schema: GraphQLSchema;
  contextValue: Record<string, unknown>;
}

export async function buildGraphQLSchema(
  openapi: object,
  baseUrl: string
): Promise<SchemaResult> {
  const headers = mergedAuthHeaders();

  // `source` may be a file path, URL, or an in-memory OpenAPI object (Mesh dereferences it).
  const schema = await loadGraphQLSchemaFromOpenAPI("ClawQL", {
    source: openapi as never,
    endpoint: baseUrl,
    cwd: getPackageRoot(),
    operationHeaders:
      Object.keys(headers).length > 0 ? headers : undefined,
    // Fewer union types on large specs; still returns JSON bodies.
    ignoreErrorResponses: true,
  });

  return { schema, contextValue: {} };
}

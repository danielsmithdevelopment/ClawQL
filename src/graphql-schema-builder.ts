/**
 * graphql-schema-builder.ts
 *
 * Builds a live GraphQL schema from OpenAPI 3 via **@omnigraph/openapi**
 * (the same stack as [GraphQL Mesh OpenAPI](https://the-guild.dev/graphql/mesh/docs/handlers/openapi)).
 * Resolvers proxy to the upstream REST API with headers from
 * CLAWQL_HTTP_HEADERS, CLAWQL_BEARER_TOKEN, and/or GOOGLE_ACCESS_TOKEN.
 */

import loadGraphQLSchemaFromOpenAPI from "@omnigraph/openapi";
import type { GraphQLSchema } from "graphql";
import { getPackageRoot } from "./package-root.js";

interface SchemaResult {
  schema: GraphQLSchema;
  contextValue: Record<string, unknown>;
}

function mergeAuthHeaders(): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = process.env.CLAWQL_HTTP_HEADERS;
  if (raw) {
    try {
      Object.assign(out, JSON.parse(raw) as Record<string, string>);
    } catch {
      console.error("[graphql-schema] Invalid CLAWQL_HTTP_HEADERS (expected JSON object)");
    }
  }
  const bearer =
    process.env.CLAWQL_BEARER_TOKEN || process.env.GOOGLE_ACCESS_TOKEN;
  if (bearer && !out.Authorization && !out.authorization) {
    out.Authorization = `Bearer ${bearer}`;
  }
  return out;
}

export async function buildGraphQLSchema(
  openapi: object,
  baseUrl: string
): Promise<SchemaResult> {
  const headers = mergeAuthHeaders();

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

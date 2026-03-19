/**
 * graphql-schema-builder.ts
 *
 * Converts the Cloud Run OpenAPI 3.0 spec (derived from the Discovery doc)
 * into a live GraphQL schema using openapi-to-graphql.
 *
 * Resolvers are auto-generated and proxy to the real Cloud Run REST API,
 * injecting the bearer token from the environment (GOOGLE_ACCESS_TOKEN)
 * or Application Default Credentials.
 *
 * The MCP server then executes targeted GraphQL queries against this schema,
 * selecting only the fields it needs — keeping responses lean before they
 * land in the agent's context window.
 */

import { createGraphQLSchema } from "openapi-to-graphql";
import type { GraphQLSchema } from "graphql";

interface SchemaResult {
  schema: GraphQLSchema;
  contextValue: Record<string, unknown>;
}

export async function buildGraphQLSchema(
  openapi: object,
  baseUrl: string
): Promise<SchemaResult> {
  const token = process.env.GOOGLE_ACCESS_TOKEN;

  const { schema, report } = await createGraphQLSchema(
    // openapi-to-graphql accepts an OpenAPI 3.x object directly
    openapi as Parameters<typeof createGraphQLSchema>[0],
    {
      baseUrl,
      // Inject the Google OAuth token into every resolver's HTTP call
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
      // Don't add viewer wrapper — we handle auth at the header level
      viewer: false,
      // Resolve all $ref schemas inline so the schema is self-contained
      fillEmptyResponses: true,
      // Report warnings but don't throw
      strict: false,
      // Cloud Run discovery-derived schemas include non-standard fields (e.g. "id")
      // that fail OAS schema validation but still work for translation.
      oasValidatorOptions: { validateSchema: false },
    }
  );

  if (report.warnings.length > 0) {
    console.error(
      `[graphql-schema] ${report.warnings.length} warnings during schema build.`
    );
  }

  return { schema, contextValue: {} };
}
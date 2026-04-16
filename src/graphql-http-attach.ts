/**
 * Mount in-process `/graphql` on an existing Express app (Streamable HTTP MCP server).
 * Same schema as standalone `clawql-graphql` — lives in its own module so importing it
 * does not run the `clawql-graphql` CLI entrypoint.
 */

import type { Express } from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { buildGraphQLSchema } from "./graphql-schema-builder.js";
import { loadSpec, resolveApiBaseUrl } from "./spec-loader.js";

export async function attachGraphqlHttpToMcpApp(app: Express): Promise<void> {
  const loaded = await loadSpec();
  const { openapi } = loaded;
  if (loaded.multi) {
    console.error(
      "[clawql-mcp-http] Combined GraphQL: schema from the **first** spec only. " +
        "MCP `execute` uses REST for merged APIs."
    );
  }
  const baseUrl = resolveApiBaseUrl(openapi);
  console.error("[clawql-mcp-http] Building in-process GraphQL for /graphql …");
  const { schema, contextValue } = await buildGraphQLSchema(openapi, baseUrl);
  // Do not add express.json() here — createMcpExpressApp already parses JSON; a second
  // parser on /graphql causes "stream is not readable".
  app.all(
    "/graphql",
    createHandler({
      schema,
      context: () => contextValue,
    })
  );
}

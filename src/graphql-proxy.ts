/**
 * graphql-proxy.ts
 *
 * Spins up a local GraphQL server generated automatically from the Cloud Run
 * OpenAPI spec (converted from Google Discovery format).
 *
 * This is the PRIVATE layer — agents never call this directly. The MCP server
 * calls it internally, constructing precise queries that fetch only the fields
 * needed before returning lean responses to the agent.
 *
 * Usage:
 *   node dist/graphql-proxy.js
 *   (or started as a child process by the MCP server)
 *
 * Requires:
 *   GOOGLE_ACCESS_TOKEN env var (or use Application Default Credentials)
 */

import express from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { loadSpec } from "./spec-loader.js";
import { buildGraphQLSchema } from "./graphql-schema-builder.js";

const PORT = process.env.GRAPHQL_PORT ? parseInt(process.env.GRAPHQL_PORT) : 4000;

async function main() {
  const { openapi, rawDiscovery } = await loadSpec();

  console.error("[graphql-proxy] Building GraphQL schema from OpenAPI spec…");
  const { schema, contextValue } = await buildGraphQLSchema(
    openapi,
    rawDiscovery.rootUrl as string
  );

  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", endpoint: `http://localhost:${PORT}/graphql` });
  });

  // GraphQL endpoint
  app.all(
    "/graphql",
    createHandler({
      schema,
      context: () => contextValue,
    })
  );

  app.listen(PORT, () => {
    console.error(`[graphql-proxy] Running at http://localhost:${PORT}/graphql`);
  });
}

main().catch((err) => {
  console.error("[graphql-proxy] Fatal error:", err);
  process.exit(1);
});
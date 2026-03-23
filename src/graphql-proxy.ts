/**
 * graphql-proxy.ts
 *
 * Local GraphQL server generated from your OpenAPI 3 spec (see spec-loader).
 *
 * Agents do not call this directly — the MCP `execute` tool uses it internally
 * to run field-selected GraphQL against the upstream REST API.
 *
 * Usage:
 *   node dist/graphql-proxy.js
 *   clawql-graphql   (when installed from npm)
 *
 * Configure the spec via CLAWQL_SPEC_PATH / CLAWQL_SPEC_URL / defaults (see README).
 */

import { resolve as resolvePath } from "node:path";
import express from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { getPackageRoot } from "./package-root.js";
import { resolveBundledProvider } from "./provider-registry.js";
import { loadSpec, resolveApiBaseUrl } from "./spec-loader.js";
import { buildGraphQLSchema } from "./graphql-schema-builder.js";

const PORT = process.env.GRAPHQL_PORT ? parseInt(process.env.GRAPHQL_PORT) : 4000;

async function main() {
  const { openapi } = await loadSpec();
  const baseUrl = resolveApiBaseUrl(openapi);

  const prov = process.env.CLAWQL_PROVIDER?.trim();
  const bundled = prov ? resolveBundledProvider(prov) : undefined;
  if (bundled?.bundledIntrospectionPath) {
    const intro = resolvePath(getPackageRoot(), bundled.bundledIntrospectionPath);
    console.error(
      `[graphql-proxy] MCP may use pregenerated introspection at ${intro} (this server still builds executable resolvers from OpenAPI).`
    );
  }

  console.error("[graphql-proxy] Building GraphQL schema from OpenAPI spec…");
  const { schema, contextValue } = await buildGraphQLSchema(
    openapi,
    baseUrl
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
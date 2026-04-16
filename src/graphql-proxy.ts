/**
 * graphql-proxy.ts
 *
 * Local GraphQL server generated from your OpenAPI 3 spec (see spec-loader).
 *
 * Agents do not call this directly — the MCP `execute` tool uses it internally
 * to run field-selected GraphQL against the upstream REST API.
 *
 * Programmatic use: `createGraphqlProxyApp()` for tests or custom servers.
 * Direct `node dist/graphql-proxy.js` runs a standalone listener (optional; not required for MCP).
 *
 * Configure the spec via CLAWQL_SPEC_PATH / CLAWQL_SPEC_URL / defaults (see README).
 */

import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import type { Express } from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { getPackageRoot } from "./package-root.js";
import { resolveBundledProvider } from "./provider-registry.js";
import { loadSpec, resolveApiBaseUrl } from "./spec-loader.js";
import { buildGraphQLSchema } from "./graphql-schema-builder.js";

const PORT = process.env.GRAPHQL_PORT ? parseInt(process.env.GRAPHQL_PORT, 10) : 4000;

export type CreateGraphqlProxyAppResult = {
  app: Express;
  /** Port the caller should listen on (from GRAPHQL_PORT or override). */
  port: number;
};

export type CreateGraphqlProxyAppOptions = {
  /** Listen port when using `startGraphqlProxy`; default from env. */
  port?: number;
};

/**
 * Build Express app with `/health` and `/graphql` (graphql-http handler).
 */
export async function createGraphqlProxyApp(
  options: CreateGraphqlProxyAppOptions = {}
): Promise<CreateGraphqlProxyAppResult> {
  const port = options.port ?? PORT;
  const loaded = await loadSpec();
  const { openapi } = loaded;
  if (loaded.multi) {
    console.error(
      "[graphql-proxy] Multi-spec env detected: building GraphQL from the **first** API only. " +
        "MCP `execute` uses REST for all merged APIs — this server is optional for multi-spec workflows."
    );
  }
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
  const { schema, contextValue } = await buildGraphQLSchema(openapi, baseUrl);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", endpoint: `http://localhost:${port}/graphql` });
  });

  app.all(
    "/graphql",
    createHandler({
      schema,
      context: () => contextValue,
    })
  );

  return { app, port };
}

export async function startGraphqlProxy(
  options: CreateGraphqlProxyAppOptions = {}
): Promise<void> {
  const { app, port } = await createGraphqlProxyApp(options);
  app.listen(port, () => {
    console.error(`[graphql-proxy] Running at http://localhost:${port}/graphql`);
  });
}

async function main() {
  await startGraphqlProxy();
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((err) => {
    console.error("[graphql-proxy] Fatal error:", err);
    process.exit(1);
  });
}

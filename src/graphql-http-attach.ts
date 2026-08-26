/**
 * Mount in-process `/graphql` on the Streamable HTTP MCP app (same process as `/mcp`).
 *
 * Merged multi-spec loads use REST for `execute`; building GraphQL from the first merged
 * OpenAPI (e.g. Cloudflare) is fragile and not required for MCP. Single-spec mode still
 * attempts `/graphql` when the OpenAPI→GraphQL build succeeds.
 *
 * Empty / native-only catalogs (no providers.pack / CLAWQL_PROVIDER) skip `/graphql`
 * without failing HTTP startup — required for the slim no-config default.
 */

import type { Express } from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { buildGraphQLSchema } from "clawql-api";
import { loadSpec, resolveApiBaseUrl } from "clawql-api";

function isNativeProtocolsOnlyStub(loaded: {
  rawSource?: Record<string, unknown>;
  openapi?: { paths?: Record<string, unknown>; servers?: unknown[] };
}): boolean {
  const raw = loaded.rawSource;
  if (raw?.stub === true || raw?.kind === "native-protocols-only") return true;
  const paths = loaded.openapi?.paths;
  const hasPaths = paths != null && Object.keys(paths).length > 0;
  const hasServers = Array.isArray(loaded.openapi?.servers) && loaded.openapi!.servers!.length > 0;
  return !hasPaths && !hasServers;
}

export async function attachGraphqlHttpToMcpApp(app: Express): Promise<void> {
  const loaded = await loadSpec();
  if (loaded.multi) {
    console.error(
      "[clawql-mcp-http] Skipping /graphql — merged multi-spec mode uses REST for execute."
    );
    return;
  }

  if (isNativeProtocolsOnlyStub(loaded)) {
    console.error(
      "[clawql-mcp-http] Skipping /graphql — no OpenAPI provider catalog (native protocols only)."
    );
    return;
  }

  const { openapi } = loaded;
  let baseUrl: string;
  try {
    baseUrl = resolveApiBaseUrl(openapi);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[clawql-mcp-http] Skipping /graphql — cannot resolve API base URL: ${message}`);
    return;
  }

  console.error("[clawql-mcp-http] Building in-process GraphQL for /graphql …");
  try {
    const { schema, contextValue } = await buildGraphQLSchema(openapi, baseUrl);
    // Do not add express.json() here — the root MCP app already parses JSON; a second
    // parser on /graphql causes "stream is not readable".
    app.all(
      "/graphql",
      createHandler({
        schema,
        context: () => contextValue,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[clawql-mcp-http] Skipping /graphql — OpenAPI→GraphQL build failed: ${message}`);
  }
}

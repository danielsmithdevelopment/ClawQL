/**
 * Mount in-process `/graphql` on the Streamable HTTP MCP app (same process as `/mcp`).
 *
 * Opt-in only (`CLAWQL_HTTP_GRAPHQL=1`). The regulated tier refuses this surface.
 * When mounted, gateway auth middleware must wrap the handler — GraphQL must not
 * bypass WORM / Panguard / mandate park.
 *
 * Merged multi-spec loads use REST for `execute`; building GraphQL from the first merged
 * OpenAPI (e.g. Cloudflare) is fragile and not required for MCP. Single-spec mode still
 * attempts `/graphql` when the OpenAPI→GraphQL build succeeds.
 *
 * Empty / native-only catalogs (no providers.pack / CLAWQL_PROVIDER) skip `/graphql`
 * without failing HTTP startup — required for the slim no-config default.
 */

import type { Express, RequestHandler } from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { buildGraphQLSchema } from "clawql-api";
import { loadSpec, resolveApiBaseUrl } from "clawql-api";

export type AttachGraphqlOptions = {
  /** Gateway auth (or equivalent) — required when GraphQL is enabled. */
  readonly auth?: RequestHandler;
};

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

export async function attachGraphqlHttpToMcpApp(
  app: Express,
  options: AttachGraphqlOptions = {}
): Promise<void> {
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
    const handler = createHandler({
      schema,
      context: () => contextValue,
    });
    if (options.auth) {
      app.all("/graphql", options.auth, handler);
    } else {
      app.all("/graphql", handler);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[clawql-mcp-http] Skipping /graphql — OpenAPI→GraphQL build failed: ${message}`);
  }
}

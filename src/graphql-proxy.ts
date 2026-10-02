/**
 * Published standalone GraphQL proxy entry (`dist/graphql-proxy.js`).
 * Implementation: `./http/graphql-proxy.ts`.
 */
import { pathToFileURL } from "node:url";
export {
  createGraphqlProxyApp,
  startGraphqlProxy,
  type CreateGraphqlProxyAppOptions,
  type CreateGraphqlProxyAppResult,
} from "./http/graphql-proxy.js";
import { startGraphqlProxy } from "./http/graphql-proxy.js";

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
  startGraphqlProxy().catch((err) => {
    console.error("[graphql-proxy] Fatal error:", err);
    process.exit(1);
  });
}

/**
 * Persistent MCP OAuth client registry and refresh-token store (SecretStore-backed).
 *
 * Effect-primary: `McpClientRegistry` / `McpRefreshStore` (from `mcp-oauth.ts`, owned
 * elsewhere) declare `Effect.Effect<A>` (never-erroring) methods, so every factory here
 * `yield*`s the underlying {@link SecretStore} call directly and lifts any IO failure to
 * a defect via `Effect.orDie` — no `Effect.runPromise` in these domain factories.
 */

import { readFileSync } from "node:fs";
import { Effect } from "effect";

import type { SecretStore } from "../stores/types.js";
import type {
  McpClientRegistry,
  McpRefreshRecord,
  McpRefreshStore,
  McpRegisteredClient,
} from "./mcp-oauth.js";

export const MCP_OAUTH_CLIENT_PREFIX = "mcp-oauth/clients/";
export const MCP_OAUTH_REFRESH_PREFIX = "mcp-oauth/refresh/";

function clientPath(clientId: string): string {
  return `${MCP_OAUTH_CLIENT_PREFIX}${clientId.trim()}`;
}

function refreshPath(hash: string): string {
  return `${MCP_OAUTH_REFRESH_PREFIX}${hash}`;
}

export function createSecretStoreMcpRefreshStore(store: SecretStore): McpRefreshStore {
  return {
    save: (hash, record) =>
      store
        .setSecret(refreshPath(hash), JSON.stringify(record satisfies McpRefreshRecord))
        .pipe(Effect.orDie),
    get: (hash) =>
      Effect.gen(function* () {
        const raw = yield* store.getSecret(refreshPath(hash));
        if (!raw) return null;
        try {
          return JSON.parse(raw) as McpRefreshRecord;
        } catch {
          return null;
        }
      }).pipe(Effect.orDie),
    revoke: (hash) => store.deleteSecret(refreshPath(hash)).pipe(Effect.orDie),
  };
}

export type SecretStoreMcpClientRegistry = McpClientRegistry & {
  saveClient: (client: McpRegisteredClient) => Effect.Effect<void>;
  deleteClient: (clientId: string) => Effect.Effect<void>;
  listClientIds: () => Effect.Effect<string[]>;
};

export function createSecretStoreMcpClientRegistry(
  store: SecretStore
): SecretStoreMcpClientRegistry {
  return {
    getClient: (clientId) =>
      Effect.gen(function* () {
        const raw = yield* store.getSecret(clientPath(clientId));
        if (!raw) return null;
        try {
          return JSON.parse(raw) as McpRegisteredClient;
        } catch {
          return null;
        }
      }).pipe(Effect.orDie),
    saveClient: (client) =>
      store.setSecret(clientPath(client.clientId), JSON.stringify(client)).pipe(Effect.orDie),
    deleteClient: (clientId) => store.deleteSecret(clientPath(clientId)).pipe(Effect.orDie),
    listClientIds: () =>
      Effect.gen(function* () {
        const paths = yield* store.listSecrets(MCP_OAUTH_CLIENT_PREFIX);
        return paths
          .map((p) => p.slice(MCP_OAUTH_CLIENT_PREFIX.length))
          .filter(Boolean)
          .sort();
      }).pipe(Effect.orDie),
  };
}

export function loadMcpClientsFromJson(raw: string): McpRegisteredClient[] {
  const parsed = JSON.parse(raw) as { clients?: McpRegisteredClient[] } | McpRegisteredClient[];
  return Array.isArray(parsed) ? parsed : (parsed.clients ?? []);
}

export function loadMcpClientsFromJsonFile(path: string): McpRegisteredClient[] {
  return loadMcpClientsFromJson(readFileSync(path, "utf8"));
}

/** Bootstrap registered MCP clients into SecretStore. */
export function bootstrapMcpClientsToStoreEffect(
  registry: SecretStoreMcpClientRegistry,
  clients: McpRegisteredClient[],
  options?: { overwrite?: boolean }
): Effect.Effect<number> {
  return Effect.gen(function* () {
    let written = 0;
    for (const client of clients) {
      if (!options?.overwrite) {
        const existing = yield* registry.getClient(client.clientId);
        if (existing) continue;
      }
      yield* registry.saveClient(client);
      written += 1;
    }
    return written;
  });
}

/**
 * Composite client registry — static/env clients first, then SecretStore.
 */
export function createCompositeMcpClientRegistry(
  ...registries: McpClientRegistry[]
): McpClientRegistry {
  return {
    getClient: (clientId) =>
      Effect.gen(function* () {
        for (const registry of registries) {
          const found = yield* registry.getClient(clientId);
          if (found) return found;
        }
        return null;
      }),
  };
}

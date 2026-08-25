/**
 * Persistent MCP OAuth client registry and refresh-token store (SecretStore-backed).
 *
 * `mcp-oauth.ts` (owned elsewhere) requires the `McpClientRegistry` / `McpRefreshStore`
 * Promise interfaces, so the factories below are thin `Effect.runPromise` façades —
 * every {@link SecretStore} call inside them runs through Effect via `yield*`.
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
      Effect.runPromise(
        store.setSecret(refreshPath(hash), JSON.stringify(record satisfies McpRefreshRecord))
      ),
    get: (hash) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const raw = yield* store.getSecret(refreshPath(hash));
          if (!raw) return null;
          try {
            return JSON.parse(raw) as McpRefreshRecord;
          } catch {
            return null;
          }
        })
      ),
    revoke: (hash) => Effect.runPromise(store.deleteSecret(refreshPath(hash))),
  };
}

export type SecretStoreMcpClientRegistry = McpClientRegistry & {
  saveClient: (client: McpRegisteredClient) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  listClientIds: () => Promise<string[]>;
};

export function createSecretStoreMcpClientRegistry(
  store: SecretStore
): SecretStoreMcpClientRegistry {
  return {
    getClient: (clientId) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const raw = yield* store.getSecret(clientPath(clientId));
          if (!raw) return null;
          try {
            return JSON.parse(raw) as McpRegisteredClient;
          } catch {
            return null;
          }
        })
      ),
    saveClient: (client) =>
      Effect.runPromise(store.setSecret(clientPath(client.clientId), JSON.stringify(client))),
    deleteClient: (clientId) => Effect.runPromise(store.deleteSecret(clientPath(clientId))),
    listClientIds: () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const paths = yield* store.listSecrets(MCP_OAUTH_CLIENT_PREFIX);
          return paths
            .map((p) => p.slice(MCP_OAUTH_CLIENT_PREFIX.length))
            .filter(Boolean)
            .sort();
        })
      ),
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
export async function bootstrapMcpClientsToStore(
  registry: SecretStoreMcpClientRegistry,
  clients: McpRegisteredClient[],
  options?: { overwrite?: boolean }
): Promise<number> {
  let written = 0;
  for (const client of clients) {
    if (!options?.overwrite) {
      const existing = await registry.getClient(client.clientId);
      if (existing) continue;
    }
    await registry.saveClient(client);
    written += 1;
  }
  return written;
}

/**
 * Composite client registry — static/env clients first, then SecretStore.
 */
export function createCompositeMcpClientRegistry(
  ...registries: McpClientRegistry[]
): McpClientRegistry {
  return {
    async getClient(clientId) {
      for (const registry of registries) {
        const found = await registry.getClient(clientId);
        if (found) return found;
      }
      return null;
    },
  };
}

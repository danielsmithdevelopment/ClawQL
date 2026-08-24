/**
 * Persistent MCP OAuth client registry and refresh-token store (SecretStore-backed).
 */

import { readFileSync } from "node:fs";

import type { SecretStore } from "../stores/types.js";
import type { McpClientRegistry, McpRefreshStore, McpRegisteredClient } from "./mcp-oauth.js";

export const MCP_OAUTH_CLIENT_PREFIX = "mcp-oauth/clients/";
export const MCP_OAUTH_REFRESH_PREFIX = "mcp-oauth/refresh/";

type RefreshRecord = {
  clientId: string;
  scope: string[];
  expiresAtMs: number;
};

function clientPath(clientId: string): string {
  return `${MCP_OAUTH_CLIENT_PREFIX}${clientId.trim()}`;
}

function refreshPath(hash: string): string {
  return `${MCP_OAUTH_REFRESH_PREFIX}${hash}`;
}

export function createSecretStoreMcpRefreshStore(store: SecretStore): McpRefreshStore {
  return {
    async save(hash, record) {
      await store.setSecret(refreshPath(hash), JSON.stringify(record satisfies RefreshRecord));
    },
    async get(hash) {
      const raw = await store.getSecret(refreshPath(hash));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as RefreshRecord;
      } catch {
        return null;
      }
    },
    async revoke(hash) {
      await store.deleteSecret(refreshPath(hash));
    },
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
    async getClient(clientId) {
      const raw = await store.getSecret(clientPath(clientId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as McpRegisteredClient;
      } catch {
        return null;
      }
    },
    async saveClient(client) {
      await store.setSecret(clientPath(client.clientId), JSON.stringify(client));
    },
    async deleteClient(clientId) {
      await store.deleteSecret(clientPath(clientId));
    },
    async listClientIds() {
      const paths = await store.listSecrets(MCP_OAUTH_CLIENT_PREFIX);
      return paths
        .map((p) => p.slice(MCP_OAUTH_CLIENT_PREFIX.length))
        .filter(Boolean)
        .sort();
    },
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

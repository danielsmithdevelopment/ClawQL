/**
 * One-time authorization codes for inbound MCP OAuth `authorization_code` + PKCE.
 */

import type { SecretStore } from "../stores/types.js";
import type { AtrClaims } from "../gateway.js";

export const MCP_OAUTH_AUTH_CODE_PREFIX = "mcp-oauth/auth-codes/";

export type McpAuthorizationCodeRecord = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string[];
  claims: AtrClaims;
  expiresAtMs: number;
  createdAtMs: number;
};

export type McpAuthorizationCodeStore = {
  save: (codeHash: string, record: McpAuthorizationCodeRecord) => Promise<void>;
  consume: (codeHash: string) => Promise<McpAuthorizationCodeRecord | null>;
};

function codePath(hash: string): string {
  return `${MCP_OAUTH_AUTH_CODE_PREFIX}${hash}`;
}

export function createSecretStoreMcpAuthorizationCodeStore(
  store: SecretStore
): McpAuthorizationCodeStore {
  return {
    async save(hash, record) {
      await store.setSecret(codePath(hash), JSON.stringify(record));
    },
    async consume(hash) {
      const path = codePath(hash);
      const raw = await store.getSecret(path);
      if (!raw) return null;
      await store.deleteSecret(path);
      try {
        return JSON.parse(raw) as McpAuthorizationCodeRecord;
      } catch {
        return null;
      }
    },
  };
}

export function createMemoryMcpAuthorizationCodeStore(): McpAuthorizationCodeStore & {
  readonly map: Map<string, McpAuthorizationCodeRecord>;
} {
  const map = new Map<string, McpAuthorizationCodeRecord>();
  return {
    map,
    async save(hash, record) {
      map.set(hash, record);
    },
    async consume(hash) {
      const record = map.get(hash) ?? null;
      if (record) map.delete(hash);
      return record;
    },
  };
}

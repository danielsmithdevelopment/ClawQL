/**
 * One-time authorization codes for inbound MCP OAuth `authorization_code` + PKCE.
 *
 * Effect-primary: `mcp-oauth.ts` (owned elsewhere) `yield*`s
 * {@link McpAuthorizationCodeStore.save} / `.consume` directly without a `mapError`, so
 * both methods declare `Effect.Effect<A>` (never-erroring) — {@link SecretStore} IO
 * failures inside {@link createSecretStoreMcpAuthorizationCodeStore} are lifted to a
 * defect via `Effect.orDie` rather than surfaced through the error channel.
 */

import { Effect } from "effect";

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
  save: (codeHash: string, record: McpAuthorizationCodeRecord) => Effect.Effect<void>;
  consume: (codeHash: string) => Effect.Effect<McpAuthorizationCodeRecord | null>;
};

function codePath(hash: string): string {
  return `${MCP_OAUTH_AUTH_CODE_PREFIX}${hash}`;
}

export function createSecretStoreMcpAuthorizationCodeStore(
  store: SecretStore
): McpAuthorizationCodeStore {
  return {
    save: (hash, record) =>
      store.setSecret(codePath(hash), JSON.stringify(record)).pipe(Effect.orDie),
    consume: (hash) =>
      Effect.gen(function* () {
        const path = codePath(hash);
        const raw = yield* store.getSecret(path);
        if (!raw) return null;
        yield* store.deleteSecret(path);
        try {
          return JSON.parse(raw) as McpAuthorizationCodeRecord;
        } catch {
          return null;
        }
      }).pipe(Effect.orDie),
  };
}

export function createMemoryMcpAuthorizationCodeStore(): McpAuthorizationCodeStore & {
  readonly map: Map<string, McpAuthorizationCodeRecord>;
} {
  const map = new Map<string, McpAuthorizationCodeRecord>();
  return {
    map,
    save: (hash, record) =>
      Effect.sync(() => {
        map.set(hash, record);
      }),
    consume: (hash) =>
      Effect.sync(() => {
        const record = map.get(hash) ?? null;
        if (record) map.delete(hash);
        return record;
      }),
  };
}

/**
 * SecretStore — swappable secret backend for clawql-auth.
 *
 * One interface; plugins implement persistence. Other clawql-auth code depends
 * only on this contract (OAuth tokens, issued API keys, nonces, opaque secrets).
 *
 * Defaults: SQLite for local / homelab / Hermes. Enterprise TEE: HashiCorp Vault
 * or OpenBao (preferred OSS / BSL-free Vault fork). Optional: Infisical,
 * Vaultwarden, 1Password Secrets Automation, env (CI only).
 */

import { Data, type Effect } from "effect";

import type { IssuedApiKeyRecord } from "../api-keys/types.js";
import type { StoredOAuthToken } from "../oauth/types.js";

/** OAuth token set persisted by SecretStore (extends outbound token shape). */
export type TokenSet = StoredOAuthToken & {
  /** When set, callers must run the re-auth UX before using the token. */
  status?: "active" | "needs_reauth";
  providerId?: string;
  updatedAtMs?: number;
};

/** Issued API key record (hashes only — never plaintext secrets). */
export type APIKeyRecord = IssuedApiKeyRecord;

export type NonceRecord = {
  readonly nonce: string;
  readonly purpose: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  consumedAtMs?: number;
  meta?: Record<string, string>;
};

export type DomainChallenge = {
  readonly domain: string;
  readonly challenge: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  meta?: Record<string, string>;
};

/** Typed failure for SecretStore IO (Effect failure channel). IO backends should fail with this. */
export class SecretStoreError extends Data.TaggedError("SecretStoreError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Pluggable secret backend. Hosts inject one instance into `createClawQLAuth`.
 * Adding a new store never requires changes to OAuth / API-key / MCP OAuth logic.
 *
 * Effect-primary: every method returns an `Effect`. Purely in-memory backends may
 * narrow the error channel to `never` (still assignable here since `E` is covariant);
 * IO backends (fs/net) should fail with {@link SecretStoreError}.
 */
export interface SecretStore {
  getSecret(path: string): Effect.Effect<string | null, SecretStoreError>;
  setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError>;
  deleteSecret(path: string): Effect.Effect<void, SecretStoreError>;
  listSecrets(prefix: string): Effect.Effect<string[], SecretStoreError>;

  getOAuthToken(providerId: string): Effect.Effect<TokenSet | null, SecretStoreError>;
  setOAuthToken(providerId: string, token: TokenSet): Effect.Effect<void, SecretStoreError>;
  markRequiresReauth(providerId: string): Effect.Effect<void, SecretStoreError>;

  getAPIKeyRecord(keyId: string): Effect.Effect<APIKeyRecord | null, SecretStoreError>;
  saveAPIKeyRecord(record: APIKeyRecord): Effect.Effect<void, SecretStoreError>;
  setRevokedAt(keyId: string, revokedAt: Date): Effect.Effect<void, SecretStoreError>;

  /** Short-lived; may be memory-backed on single-node deployments. */
  storeNonce(nonce: string, data: NonceRecord): Effect.Effect<void, SecretStoreError>;
  getNonce(nonce: string): Effect.Effect<NonceRecord | null, SecretStoreError>;
  markNonceConsumed(nonce: string): Effect.Effect<void, SecretStoreError>;
  storeDomainChallenge(
    domain: string,
    challenge: DomainChallenge
  ): Effect.Effect<void, SecretStoreError>;
  getDomainChallenge(domain: string): Effect.Effect<DomainChallenge | null, SecretStoreError>;
  deleteDomainChallenge(domain: string): Effect.Effect<void, SecretStoreError>;
}

/** Well-known path prefixes used by {@link PathSecretStore}. */
export const SECRET_PATH = {
  oauth: "oauth/",
  apiKeys: "api-keys/",
  nonces: "nonces/",
  domainChallenges: "domain-challenges/",
} as const;

export type SecretStoreKind =
  | "sqlite"
  | "memory"
  | "env"
  | "hashicorp-vault"
  | "openbao"
  | "infisical"
  | "vaultwarden"
  | "onepassword";

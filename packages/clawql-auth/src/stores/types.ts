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

/**
 * Pluggable secret backend. Hosts inject one instance into `createClawQLAuth`.
 * Adding a new store never requires changes to OAuth / API-key / MCP OAuth logic.
 */
export interface SecretStore {
  getSecret(path: string): Promise<string | null>;
  setSecret(path: string, value: string): Promise<void>;
  deleteSecret(path: string): Promise<void>;
  listSecrets(prefix: string): Promise<string[]>;

  getOAuthToken(providerId: string): Promise<TokenSet | null>;
  setOAuthToken(providerId: string, token: TokenSet): Promise<void>;
  markRequiresReauth(providerId: string): Promise<void>;

  getAPIKeyRecord(keyId: string): Promise<APIKeyRecord | null>;
  saveAPIKeyRecord(record: APIKeyRecord): Promise<void>;
  setRevokedAt(keyId: string, revokedAt: Date): Promise<void>;

  /** Short-lived; may be memory-backed on single-node deployments. */
  storeNonce(nonce: string, data: NonceRecord): Promise<void>;
  getNonce(nonce: string): Promise<NonceRecord | null>;
  markNonceConsumed(nonce: string): Promise<void>;
  storeDomainChallenge(domain: string, challenge: DomainChallenge): Promise<void>;
  getDomainChallenge(domain: string): Promise<DomainChallenge | null>;
  deleteDomainChallenge(domain: string): Promise<void>;
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

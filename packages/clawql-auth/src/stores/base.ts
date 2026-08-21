/**
 * PathSecretStore — implement only KV CRUD; OAuth / API keys / nonces use path prefixes.
 */

import type { APIKeyRecord, DomainChallenge, NonceRecord, SecretStore, TokenSet } from "./types.js";
import { SECRET_PATH } from "./types.js";

function oauthPath(providerId: string): string {
  return `${SECRET_PATH.oauth}${providerId}`;
}

function apiKeyPath(keyId: string): string {
  return `${SECRET_PATH.apiKeys}${keyId}`;
}

function noncePath(nonce: string): string {
  return `${SECRET_PATH.nonces}${nonce}`;
}

function domainChallengePath(domain: string): string {
  return `${SECRET_PATH.domainChallenges}${domain}`;
}

function parseJson<T>(raw: string | null): T | null {
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Subclasses implement the four KV methods; lifecycle helpers serialize JSON under
 * {@link SECRET_PATH} prefixes so every backend shares the same logical layout.
 */
export abstract class PathSecretStore implements SecretStore {
  abstract getSecret(path: string): Promise<string | null>;
  abstract setSecret(path: string, value: string): Promise<void>;
  abstract deleteSecret(path: string): Promise<void>;
  abstract listSecrets(prefix: string): Promise<string[]>;

  async getOAuthToken(providerId: string): Promise<TokenSet | null> {
    return parseJson<TokenSet>(await this.getSecret(oauthPath(providerId)));
  }

  async setOAuthToken(providerId: string, token: TokenSet): Promise<void> {
    const next: TokenSet = {
      ...token,
      providerId,
      status: token.status ?? "active",
      updatedAtMs: token.updatedAtMs ?? Date.now(),
    };
    await this.setSecret(oauthPath(providerId), JSON.stringify(next));
  }

  async markRequiresReauth(providerId: string): Promise<void> {
    const current = (await this.getOAuthToken(providerId)) ?? {
      accessToken: "",
      expiresAtMs: 0,
      providerId,
    };
    await this.setOAuthToken(providerId, {
      ...current,
      status: "needs_reauth",
      updatedAtMs: Date.now(),
    });
  }

  async getAPIKeyRecord(keyId: string): Promise<APIKeyRecord | null> {
    return parseJson<APIKeyRecord>(await this.getSecret(apiKeyPath(keyId)));
  }

  async saveAPIKeyRecord(record: APIKeyRecord): Promise<void> {
    await this.setSecret(apiKeyPath(record.id), JSON.stringify(record));
  }

  async setRevokedAt(keyId: string, revokedAt: Date): Promise<void> {
    const current = await this.getAPIKeyRecord(keyId);
    if (!current) {
      throw new Error(`api_key_not_found:${keyId}`);
    }
    await this.saveAPIKeyRecord({
      ...current,
      revokedAt: revokedAt.toISOString(),
    });
  }

  async storeNonce(nonce: string, data: NonceRecord): Promise<void> {
    await this.setSecret(noncePath(nonce), JSON.stringify({ ...data, nonce }));
  }

  async getNonce(nonce: string): Promise<NonceRecord | null> {
    return parseJson<NonceRecord>(await this.getSecret(noncePath(nonce)));
  }

  async markNonceConsumed(nonce: string): Promise<void> {
    const current = await this.getNonce(nonce);
    if (!current) {
      throw new Error(`nonce_not_found:${nonce}`);
    }
    await this.storeNonce(nonce, {
      ...current,
      consumedAtMs: Date.now(),
    });
  }

  async storeDomainChallenge(domain: string, challenge: DomainChallenge): Promise<void> {
    await this.setSecret(domainChallengePath(domain), JSON.stringify({ ...challenge, domain }));
  }

  async getDomainChallenge(domain: string): Promise<DomainChallenge | null> {
    return parseJson<DomainChallenge>(await this.getSecret(domainChallengePath(domain)));
  }

  async deleteDomainChallenge(domain: string): Promise<void> {
    await this.deleteSecret(domainChallengePath(domain));
  }
}

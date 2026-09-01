/**
 * PathSecretStore — implement only KV CRUD; OAuth / API keys / nonces use path prefixes.
 * Lifecycle helpers are Effect-primary (`Effect.gen` + `yield* this.getSecret(...)`), so
 * every backend automatically gets the same JSON-over-KV semantics for free.
 */

import { Effect } from "effect";

import type { APIKeyRecord, DomainChallenge, NonceRecord, SecretStore, TokenSet } from "./types.js";
import { SECRET_PATH, SecretStoreError } from "./types.js";

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
  abstract getSecret(path: string): Effect.Effect<string | null, SecretStoreError>;
  abstract setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError>;
  abstract deleteSecret(path: string): Effect.Effect<void, SecretStoreError>;
  abstract listSecrets(prefix: string): Effect.Effect<string[], SecretStoreError>;

  getOAuthToken(providerId: string): Effect.Effect<TokenSet | null, SecretStoreError> {
    return Effect.gen(this, function* () {
      const raw = yield* this.getSecret(oauthPath(providerId));
      return parseJson<TokenSet>(raw);
    });
  }

  setOAuthToken(providerId: string, token: TokenSet): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      const next: TokenSet = {
        ...token,
        providerId,
        status: token.status ?? "active",
        updatedAtMs: token.updatedAtMs ?? Date.now(),
      };
      yield* this.setSecret(oauthPath(providerId), JSON.stringify(next));
    });
  }

  markRequiresReauth(providerId: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      const current = (yield* this.getOAuthToken(providerId)) ?? {
        accessToken: "",
        expiresAtMs: 0,
        providerId,
      };
      yield* this.setOAuthToken(providerId, {
        ...current,
        status: "needs_reauth",
        updatedAtMs: Date.now(),
      });
    });
  }

  getAPIKeyRecord(keyId: string): Effect.Effect<APIKeyRecord | null, SecretStoreError> {
    return Effect.gen(this, function* () {
      const raw = yield* this.getSecret(apiKeyPath(keyId));
      return parseJson<APIKeyRecord>(raw);
    });
  }

  saveAPIKeyRecord(record: APIKeyRecord): Effect.Effect<void, SecretStoreError> {
    return this.setSecret(apiKeyPath(record.id), JSON.stringify(record));
  }

  setRevokedAt(keyId: string, revokedAt: Date): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      const current = yield* this.getAPIKeyRecord(keyId);
      if (!current) {
        return yield* Effect.fail(new SecretStoreError({ reason: `api_key_not_found:${keyId}` }));
      }
      yield* this.saveAPIKeyRecord({
        ...current,
        revokedAt: revokedAt.toISOString(),
      });
    });
  }

  storeNonce(nonce: string, data: NonceRecord): Effect.Effect<void, SecretStoreError> {
    return this.setSecret(noncePath(nonce), JSON.stringify({ ...data, nonce }));
  }

  getNonce(nonce: string): Effect.Effect<NonceRecord | null, SecretStoreError> {
    return Effect.gen(this, function* () {
      const raw = yield* this.getSecret(noncePath(nonce));
      return parseJson<NonceRecord>(raw);
    });
  }

  markNonceConsumed(nonce: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      const current = yield* this.getNonce(nonce);
      if (!current) {
        return yield* Effect.fail(new SecretStoreError({ reason: `nonce_not_found:${nonce}` }));
      }
      yield* this.storeNonce(nonce, {
        ...current,
        consumedAtMs: Date.now(),
      });
    });
  }

  storeDomainChallenge(
    domain: string,
    challenge: DomainChallenge
  ): Effect.Effect<void, SecretStoreError> {
    return this.setSecret(domainChallengePath(domain), JSON.stringify({ ...challenge, domain }));
  }

  getDomainChallenge(domain: string): Effect.Effect<DomainChallenge | null, SecretStoreError> {
    return Effect.gen(this, function* () {
      const raw = yield* this.getSecret(domainChallengePath(domain));
      return parseJson<DomainChallenge>(raw);
    });
  }

  deleteDomainChallenge(domain: string): Effect.Effect<void, SecretStoreError> {
    return this.deleteSecret(domainChallengePath(domain));
  }
}

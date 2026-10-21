/**
 * SecretStore decorator — encrypt values with Vault / OpenBao Transit before
 * persisting to an inner store (SQLite, Vault KV, memory, …).
 *
 * A stealer dumping the inner store (e.g. LiteLLM-style CredentialsTable dump)
 * gets Transit ciphertext only; the encryption key never leaves Vault.
 *
 * Legacy plaintext rows are returned as-is on read so existing stores can be
 * gradually re-encrypted on next write.
 */

import { Effect } from "effect";

import {
  VaultTransitError,
  isVaultTransitCiphertext,
  type VaultTransitProvider,
} from "../vault/transit.js";
import { PathSecretStore } from "./base.js";
import { SecretStoreError } from "./types.js";
import type { SecretStore } from "./types.js";

export type TransitEncryptedSecretStoreOptions = {
  /** Persistence backend that stores ciphertext (or legacy plaintext). */
  inner: SecretStore;
  /** Transit client (encrypt / decrypt / rewrap). */
  transit: VaultTransitProvider;
};

function mapTransitError(err: VaultTransitError): SecretStoreError {
  return new SecretStoreError({ reason: err.reason, cause: err });
}

/**
 * KV methods encrypt on write and decrypt on read. Lifecycle helpers come from
 * {@link PathSecretStore} and therefore go through the same encrypt/decrypt path.
 */
export class TransitEncryptedSecretStore extends PathSecretStore {
  readonly kind = "transit-encrypted" as const;
  private readonly inner: SecretStore;
  private readonly transit: VaultTransitProvider;

  constructor(options: TransitEncryptedSecretStoreOptions) {
    super();
    this.inner = options.inner;
    this.transit = options.transit;
  }

  getSecret(path: string): Effect.Effect<string | null, SecretStoreError> {
    return Effect.gen({ self: this }, function* () {
      const raw = yield* this.inner.getSecret(path);
      if (raw == null) return null;
      if (!isVaultTransitCiphertext(raw)) {
        // Pre-Transit plaintext — still usable until the next setSecret.
        return raw;
      }
      return yield* this.transit.decrypt(raw).pipe(Effect.mapError(mapTransitError));
    });
  }

  setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen({ self: this }, function* () {
      const ciphertext = yield* this.transit.encrypt(value).pipe(Effect.mapError(mapTransitError));
      yield* this.inner.setSecret(path, ciphertext);
    });
  }

  deleteSecret(path: string): Effect.Effect<void, SecretStoreError> {
    return this.inner.deleteSecret(path);
  }

  listSecrets(prefix: string): Effect.Effect<string[], SecretStoreError> {
    return this.inner.listSecrets(prefix);
  }

  /**
   * Re-wrap a single path under the latest Transit key version without exposing
   * plaintext to the caller. No-op when the stored value is legacy plaintext.
   */
  rewrapSecret(path: string): Effect.Effect<boolean, SecretStoreError> {
    return Effect.gen({ self: this }, function* () {
      const raw = yield* this.inner.getSecret(path);
      if (raw == null || !isVaultTransitCiphertext(raw)) return false;
      const next = yield* this.transit.rewrap(raw).pipe(Effect.mapError(mapTransitError));
      yield* this.inner.setSecret(path, next);
      return true;
    });
  }
}

export function createTransitEncryptedSecretStore(
  options: TransitEncryptedSecretStoreOptions
): TransitEncryptedSecretStore {
  return new TransitEncryptedSecretStore(options);
}

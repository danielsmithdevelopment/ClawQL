/**
 * SecretStore decorator — encrypt values with Vault / OpenBao Transit before
 * persisting to an inner store (SQLite, Vault KV, memory, …).
 *
 * Each ciphertext is bound to tenant + secret path via Transit derived-key
 * context, so a dump that copies a row between tenants cannot decrypt it.
 *
 * Fail-closed: Vault unreachable / decrypt errors surface as SecretStoreError
 * (never return ciphertext as if it were plaintext). A short in-memory cache
 * of recently decrypted values rides out brief Vault blips; plaintext is never
 * written to disk or logs.
 */

import { Effect } from "effect";

import {
  emitAuthEventEffect,
  noopAuthEventSink,
  type AuthEventSink,
} from "../audit/auth-events.js";
import {
  VaultTransitError,
  isVaultTransitCiphertext,
  resolveTransitTenantId,
  type TransitCryptoContext,
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
  /**
   * Fallback tenant when the path is not under `tenants/{id}/…`.
   * Default: `CLAWQL_VAULT_TRANSIT_TENANT` / `CLAWQL_DEFAULT_ORG_ID` / `default`.
   */
  tenantId?: string;
  /**
   * After migration: refuse to return legacy plaintext rows (fail closed).
   * Default: env `CLAWQL_VAULT_TRANSIT_REJECT_PLAINTEXT=1`.
   */
  rejectPlaintext?: boolean;
  /**
   * Brief in-memory plaintext cache TTL (ms) to survive short Vault outages.
   * Default 30_000; set 0 to disable. Never persisted.
   */
  decryptCacheTtlMs?: number;
  /** Loud alerts on decrypt failure / plaintext rejection. */
  eventSink?: AuthEventSink;
  now?: () => number;
};

function mapTransitError(err: VaultTransitError): SecretStoreError {
  return new SecretStoreError({ reason: err.reason, cause: err });
}

function defaultTenantId(explicit?: string): string {
  return (
    explicit?.trim() ||
    process.env.CLAWQL_VAULT_TRANSIT_TENANT?.trim() ||
    process.env.CLAWQL_DEFAULT_ORG_ID?.trim() ||
    "default"
  );
}

type CacheEntry = { readonly plaintext: string; readonly expiresAtMs: number };

/**
 * KV methods encrypt on write and decrypt on read. Lifecycle helpers come from
 * {@link PathSecretStore} and therefore go through the same encrypt/decrypt path.
 */
export class TransitEncryptedSecretStore extends PathSecretStore {
  readonly kind = "transit-encrypted" as const;
  private readonly inner: SecretStore;
  private readonly transit: VaultTransitProvider;
  private readonly fallbackTenantId: string;
  private readonly rejectPlaintext: boolean;
  private readonly decryptCacheTtlMs: number;
  private readonly eventSink: AuthEventSink;
  private readonly now: () => number;
  private readonly decryptCache = new Map<string, CacheEntry>();

  constructor(options: TransitEncryptedSecretStoreOptions) {
    super();
    this.inner = options.inner;
    this.transit = options.transit;
    this.fallbackTenantId = defaultTenantId(options.tenantId);
    this.rejectPlaintext =
      options.rejectPlaintext ?? process.env.CLAWQL_VAULT_TRANSIT_REJECT_PLAINTEXT === "1";
    const ttl =
      options.decryptCacheTtlMs ??
      Number(process.env.CLAWQL_VAULT_TRANSIT_CACHE_TTL_MS?.trim() || "30000");
    this.decryptCacheTtlMs = Number.isFinite(ttl) && ttl >= 0 ? ttl : 30_000;
    this.eventSink = options.eventSink ?? noopAuthEventSink;
    this.now = options.now ?? Date.now;
  }

  /** Expose inner store for migration/scan jobs (ciphertext / plaintext inspection). */
  getInnerStore(): SecretStore {
    return this.inner;
  }

  cryptoContextFor(path: string): TransitCryptoContext {
    return {
      tenantId: resolveTransitTenantId(path, this.fallbackTenantId),
      secretPath: path,
    };
  }

  private cacheKey(path: string, ciphertext: string): string {
    return `${path}\0${ciphertext}`;
  }

  private readCache(path: string, ciphertext: string): string | null {
    if (this.decryptCacheTtlMs <= 0) return null;
    const hit = this.decryptCache.get(this.cacheKey(path, ciphertext));
    if (!hit) return null;
    if (hit.expiresAtMs <= this.now()) {
      this.decryptCache.delete(this.cacheKey(path, ciphertext));
      return null;
    }
    return hit.plaintext;
  }

  private writeCache(path: string, ciphertext: string, plaintext: string): void {
    if (this.decryptCacheTtlMs <= 0) return;
    this.decryptCache.set(this.cacheKey(path, ciphertext), {
      plaintext,
      expiresAtMs: this.now() + this.decryptCacheTtlMs,
    });
  }

  /** Drop cached plaintext (e.g. after set/delete). */
  private invalidateCache(path: string): void {
    for (const key of this.decryptCache.keys()) {
      if (key.startsWith(`${path}\0`)) this.decryptCache.delete(key);
    }
  }

  getSecret(path: string): Effect.Effect<string | null, SecretStoreError> {
    return Effect.gen({ self: this }, function* () {
      const raw = yield* this.inner.getSecret(path);
      if (raw == null) return null;
      if (!isVaultTransitCiphertext(raw)) {
        if (this.rejectPlaintext) {
          yield* emitAuthEventEffect(this.eventSink, {
            type: "VAULT_TRANSIT_PLAINTEXT_REJECTED",
            path,
            timestamp: new Date(this.now()).toISOString(),
          });
          return yield* Effect.fail(
            new SecretStoreError({
              reason: `vault_transit_plaintext_rejected:${path}`,
            })
          );
        }
        // Pre-migration plaintext — usable until migratePlaintextSecrets runs.
        return raw;
      }

      const cached = this.readCache(path, raw);
      if (cached != null) return cached;

      const ctx = this.cryptoContextFor(path);
      const plaintext = yield* this.transit.decrypt(raw, ctx).pipe(
        Effect.tapError((err) =>
          emitAuthEventEffect(this.eventSink, {
            type: "VAULT_TRANSIT_DECRYPT_FAILED",
            path,
            reason: err.reason,
            timestamp: new Date(this.now()).toISOString(),
          })
        ),
        Effect.mapError(mapTransitError)
      );
      this.writeCache(path, raw, plaintext);
      return plaintext;
    });
  }

  setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen({ self: this }, function* () {
      const ctx = this.cryptoContextFor(path);
      const ciphertext = yield* this.transit
        .encrypt(value, ctx)
        .pipe(Effect.mapError(mapTransitError));
      yield* this.inner.setSecret(path, ciphertext);
      this.invalidateCache(path);
      this.writeCache(path, ciphertext, value);
    });
  }

  deleteSecret(path: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen({ self: this }, function* () {
      yield* this.inner.deleteSecret(path);
      this.invalidateCache(path);
    });
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
      const ctx = this.cryptoContextFor(path);
      const next = yield* this.transit.rewrap(raw, ctx).pipe(Effect.mapError(mapTransitError));
      yield* this.inner.setSecret(path, next);
      this.invalidateCache(path);
      return true;
    });
  }
}

export function createTransitEncryptedSecretStore(
  options: TransitEncryptedSecretStoreOptions
): TransitEncryptedSecretStore {
  return new TransitEncryptedSecretStore(options);
}

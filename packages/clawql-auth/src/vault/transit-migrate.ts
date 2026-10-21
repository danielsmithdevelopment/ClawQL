/**
 * One-time plaintext → Transit migration, plaintext scan, and bulk rewrap.
 * Effect-primary. Operates on {@link TransitEncryptedSecretStore} so encrypt
 * uses the same tenant+path context as live reads/writes.
 */

import { Effect } from "effect";

import {
  emitAuthEventEffect,
  noopAuthEventSink,
  type AuthEventSink,
} from "../audit/auth-events.js";
import type { TransitEncryptedSecretStore } from "../stores/transit-encrypted.js";
import { SecretStoreError } from "../stores/types.js";
import { isVaultTransitCiphertext } from "./transit.js";

export type TransitMigrateReport = {
  readonly migrated: number;
  readonly alreadyCiphertext: number;
  readonly failed: number;
  readonly failures: ReadonlyArray<{ path: string; reason: string }>;
};

export type TransitScanReport = {
  readonly plaintextPaths: ReadonlyArray<string>;
  readonly ciphertextPaths: ReadonlyArray<string>;
  readonly missingPaths: ReadonlyArray<string>;
};

export type TransitRewrapReport = {
  readonly rewrapped: number;
  readonly skipped: number;
  readonly failed: number;
  readonly failures: ReadonlyArray<{ path: string; reason: string }>;
};

function errReason(err: unknown): string {
  if (err instanceof SecretStoreError) return err.reason;
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * List paths under `prefix` whose stored value is still plaintext (not `vault:vN:`).
 * Use after migration to confirm zero plaintext remains before enabling
 * `CLAWQL_VAULT_TRANSIT_REJECT_PLAINTEXT=1`.
 */
export function scanPlaintextSecretsEffect(
  store: TransitEncryptedSecretStore,
  prefix = ""
): Effect.Effect<TransitScanReport, SecretStoreError> {
  return Effect.gen(function* () {
    const inner = store.getInnerStore();
    const paths = yield* inner.listSecrets(prefix);
    const plaintextPaths: string[] = [];
    const ciphertextPaths: string[] = [];
    const missingPaths: string[] = [];
    for (const path of paths) {
      const raw = yield* inner.getSecret(path);
      if (raw == null) {
        missingPaths.push(path);
        continue;
      }
      if (isVaultTransitCiphertext(raw)) ciphertextPaths.push(path);
      else plaintextPaths.push(path);
    }
    return { plaintextPaths, ciphertextPaths, missingPaths };
  });
}

/**
 * Encrypt every legacy plaintext row in place (tenant+path context). Ciphertext
 * rows are left untouched. Does not delete pre-migration DB backups — rotate
 * provider keys or purge backups after a clean scan.
 */
export function migratePlaintextSecretsEffect(
  store: TransitEncryptedSecretStore,
  options: { prefix?: string; eventSink?: AuthEventSink; now?: () => number } = {}
): Effect.Effect<TransitMigrateReport, never> {
  const eventSink = options.eventSink ?? noopAuthEventSink;
  const now = options.now ?? Date.now;
  const prefix = options.prefix ?? "";
  return Effect.gen(function* () {
    const inner = store.getInnerStore();
    let migrated = 0;
    let alreadyCiphertext = 0;
    let failed = 0;
    const failures: Array<{ path: string; reason: string }> = [];

    const paths = yield* inner.listSecrets(prefix).pipe(
      Effect.catch((e: unknown) => {
        failures.push({ path: prefix || "*", reason: errReason(e) });
        failed += 1;
        return Effect.succeed([] as string[]);
      })
    );

    for (const path of paths) {
      const raw = yield* inner.getSecret(path).pipe(
        Effect.catch(() => Effect.succeed(null as string | null))
      );
      if (raw == null) continue;
      if (isVaultTransitCiphertext(raw)) {
        alreadyCiphertext += 1;
        continue;
      }
      // Read via outer store would return plaintext; setSecret encrypts with context.
      const wrote = yield* store.setSecret(path, raw).pipe(
        Effect.as(true as const),
        Effect.catch((e: unknown) => {
          failed += 1;
          failures.push({ path, reason: errReason(e) });
          return Effect.succeed(false as const);
        })
      );
      if (wrote) migrated += 1;
    }

    const report: TransitMigrateReport = { migrated, alreadyCiphertext, failed, failures };
    yield* emitAuthEventEffect(eventSink, {
      type: "VAULT_TRANSIT_MIGRATE_COMPLETED",
      migrated,
      alreadyCiphertext,
      failed,
      timestamp: new Date(now()).toISOString(),
    });
    return report;
  });
}

/**
 * Rewrap all ciphertext under `prefix` onto the latest Transit key version
 * (after `vault write -f transit/keys/NAME/rotate`). Schedule regularly so old
 * key versions can be retired (`min_decryption_version`).
 */
export function rewrapAllSecretsEffect(
  store: TransitEncryptedSecretStore,
  options: { prefix?: string; eventSink?: AuthEventSink; now?: () => number } = {}
): Effect.Effect<TransitRewrapReport, never> {
  const eventSink = options.eventSink ?? noopAuthEventSink;
  const now = options.now ?? Date.now;
  const prefix = options.prefix ?? "";
  return Effect.gen(function* () {
    let rewrapped = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ path: string; reason: string }> = [];

    const paths = yield* store.listSecrets(prefix).pipe(
      Effect.catch((e: unknown) => {
        failures.push({ path: prefix || "*", reason: errReason(e) });
        failed += 1;
        return Effect.succeed([] as string[]);
      })
    );

    for (const path of paths) {
      const outcome = yield* store.rewrapSecret(path).pipe(
        Effect.catch((e: unknown) => {
          failed += 1;
          failures.push({ path, reason: errReason(e) });
          return Effect.succeed(null as boolean | null);
        })
      );
      if (outcome === null) continue;
      if (outcome) rewrapped += 1;
      else skipped += 1;
    }

    const report: TransitRewrapReport = { rewrapped, skipped, failed, failures };
    yield* emitAuthEventEffect(eventSink, {
      type: "VAULT_TRANSIT_REWRAP_COMPLETED",
      rewrapped,
      skipped,
      failed,
      timestamp: new Date(now()).toISOString(),
    });
    return report;
  });
}

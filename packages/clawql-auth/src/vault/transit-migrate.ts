/**
 * Transit ops — integrity scan (ciphertext-only) and bulk rewrap after key rotation.
 * Effect-primary. Operates on {@link TransitEncryptedSecretStore}.
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
 * Integrity scan: list paths under `prefix` that are not Transit ciphertext.
 * A healthy store has `plaintextPaths.length === 0`.
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
 * Rewrap all ciphertext under `prefix` onto the latest Transit key version
 * (after `vault write -f transit/keys/NAME/rotate`). Schedule regularly so old
 * key versions can be retired (`min_decryption_version`). Non-ciphertext rows
 * count as failures (store must be ciphertext-only).
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

/**
 * Effect Tag + Layer for vault crypto-shredding (per-note AES keys + erase deny-list).
 */

import { Context, Effect, Layer } from "effect";
import {
  appendErasureDenyEffect,
  deletePathMapEntryEffect,
  destroyNoteKeyEffect,
  loadErasureDenyHashesEffectInner,
  loadOrCreateNoteKeyEffect,
  lookupPathMapByPathEffect,
  maybeDecryptVaultReadEffect,
  maybeEncryptForVaultWriteEffect,
  memoryCryptoShredEnabled,
  type ErasureDenyEntry,
  type PathMapEntry,
} from "../crypto/shred.js";
import { MemoryError } from "./memory-errors.js";

export class MemoryCryptoShredService extends Context.Service<MemoryCryptoShredService, {
    readonly enabled: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
    readonly encryptForWrite: (
      vaultRoot: string,
      relativePath: string,
      plaintext: string,
      opts?: { noteId?: string; env?: NodeJS.ProcessEnv }
    ) => Effect.Effect<string, MemoryError>;
    readonly decryptForRead: (
      vaultRoot: string,
      text: string,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<string, MemoryError>;
    readonly destroyKey: (vaultRoot: string, noteId: string) => Effect.Effect<boolean, MemoryError>;
    readonly loadOrCreateKey: (
      vaultRoot: string,
      noteId: string
    ) => Effect.Effect<Buffer, MemoryError>;
    readonly lookupPath: (
      vaultRoot: string,
      path: string
    ) => Effect.Effect<PathMapEntry | undefined, MemoryError>;
    readonly deletePath: (
      vaultRoot: string,
      path: string
    ) => Effect.Effect<PathMapEntry | undefined, MemoryError>;
    readonly appendDeny: (
      vaultRoot: string,
      entry: Omit<ErasureDenyEntry, "erasedAt"> & { erasedAt?: string }
    ) => Effect.Effect<void, MemoryError>;
    readonly loadDenyHashes: (vaultRoot: string) => Effect.Effect<ReadonlySet<string>, MemoryError>;
  }>()("clawql/MemoryCryptoShredService") {}

function mapError<A>(effect: Effect.Effect<A, Error>): Effect.Effect<A, MemoryError> {
  return effect.pipe(
    Effect.mapError(
      (cause) =>
        new MemoryError({
          reason: cause instanceof Error ? cause.message : "crypto-shred operation failed",
          cause,
        })
    )
  );
}

/** Live service implementation (explicit param types avoid DTS `of` Shape collapse). */
export function memoryCryptoShredLiveService() {
  return MemoryCryptoShredService.of({
    enabled: (env?: NodeJS.ProcessEnv) => Effect.sync(() => memoryCryptoShredEnabled(env)),
    encryptForWrite: (
      vaultRoot: string,
      relativePath: string,
      plaintext: string,
      opts?: { noteId?: string; env?: NodeJS.ProcessEnv }
    ) => mapError(maybeEncryptForVaultWriteEffect(vaultRoot, relativePath, plaintext, opts)),
    decryptForRead: (vaultRoot: string, text: string, env?: NodeJS.ProcessEnv) =>
      mapError(maybeDecryptVaultReadEffect(vaultRoot, text, env)),
    destroyKey: (vaultRoot: string, noteId: string) =>
      mapError(destroyNoteKeyEffect(vaultRoot, noteId)),
    loadOrCreateKey: (vaultRoot: string, noteId: string) =>
      mapError(loadOrCreateNoteKeyEffect(vaultRoot, noteId)),
    lookupPath: (vaultRoot: string, path: string) =>
      mapError(lookupPathMapByPathEffect(vaultRoot, path)),
    deletePath: (vaultRoot: string, path: string) =>
      mapError(deletePathMapEntryEffect(vaultRoot, path)),
    appendDeny: (
      vaultRoot: string,
      entry: Omit<ErasureDenyEntry, "erasedAt"> & { erasedAt?: string }
    ) => mapError(appendErasureDenyEffect(vaultRoot, entry).pipe(Effect.asVoid)),
    loadDenyHashes: (vaultRoot: string) => mapError(loadErasureDenyHashesEffectInner(vaultRoot)),
  });
}

export const MemoryCryptoShredLive = Layer.succeed(
  MemoryCryptoShredService,
  memoryCryptoShredLiveService()
);

export function memoryCryptoShredLiveLayer(): Layer.Layer<MemoryCryptoShredService> {
  return MemoryCryptoShredLive;
}

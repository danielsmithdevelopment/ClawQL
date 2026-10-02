/**
 * Effect Tag + Layer for vault crypto-shredding (per-note AES keys + erase deny-list).
 */

import { Context, Effect, Layer } from "effect";
import {
  appendErasureDeny,
  deletePathMapEntry,
  destroyNoteKey,
  loadErasureDenyHashes,
  loadOrCreateNoteKey,
  lookupPathMapByPath,
  maybeDecryptVaultRead,
  maybeEncryptForVaultWrite,
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

function fromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, MemoryError> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new MemoryError({
        reason: cause instanceof Error ? cause.message : "crypto-shred operation failed",
        cause,
      }),
  });
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
    ) => fromPromise(() => maybeEncryptForVaultWrite(vaultRoot, relativePath, plaintext, opts)),
    decryptForRead: (vaultRoot: string, text: string, env?: NodeJS.ProcessEnv) =>
      fromPromise(() => maybeDecryptVaultRead(vaultRoot, text, env)),
    destroyKey: (vaultRoot: string, noteId: string) =>
      fromPromise(() => destroyNoteKey(vaultRoot, noteId)),
    loadOrCreateKey: (vaultRoot: string, noteId: string) =>
      fromPromise(() => loadOrCreateNoteKey(vaultRoot, noteId)),
    lookupPath: (vaultRoot: string, path: string) =>
      fromPromise(() => lookupPathMapByPath(vaultRoot, path)),
    deletePath: (vaultRoot: string, path: string) =>
      fromPromise(() => deletePathMapEntry(vaultRoot, path)),
    appendDeny: (
      vaultRoot: string,
      entry: Omit<ErasureDenyEntry, "erasedAt"> & { erasedAt?: string }
    ) =>
      fromPromise(async () => {
        await appendErasureDeny(vaultRoot, entry);
      }),
    loadDenyHashes: (vaultRoot: string) => fromPromise(() => loadErasureDenyHashes(vaultRoot)),
  });
}

export const MemoryCryptoShredLive = Layer.succeed(
  MemoryCryptoShredService,
  memoryCryptoShredLiveService()
);

export function memoryCryptoShredLiveLayer(): Layer.Layer<MemoryCryptoShredService> {
  return MemoryCryptoShredLive;
}

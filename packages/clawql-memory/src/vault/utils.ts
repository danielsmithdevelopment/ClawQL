/**
 * Safe read/write under an Obsidian vault root with cooperative write locking.
 * When crypto-shredding is enabled, Memory notes are encrypted at rest (git-safe).
 *
 * Domain APIs are Effect-primary; thin Promise façades remain for ingest/erase edges.
 */

import { open, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { Duration, Effect, Exit } from "effect";
import {
  extractNoteIdFromEnvelope,
  isEncryptedVaultEnvelope,
  maybeDecryptVaultReadEffect,
  maybeEncryptForVaultWriteEffect,
} from "../crypto/shred.js";

const LOCK_NAME = ".clawql-vault-write.lock";
const LOCK_POLL_MS = 100;
const LOCK_MAX_ATTEMPTS = 100;

function assertInsideVault(vaultRoot: string, absolutePath: string): void {
  const root = resolve(vaultRoot);
  const target = resolve(absolutePath);
  if (target === root) {
    return;
  }
  const rel = relative(root, target);
  if (rel.startsWith("..") || rel === "..") {
    throw new Error(`Path escapes vault root: ${absolutePath}`);
  }
}

/**
 * Resolve a path relative to the vault root; rejects `..` segments.
 */
export function resolveVaultPath(vaultRoot: string, relativePath: string): string {
  const root = resolve(vaultRoot);
  const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.split("/").some((p) => p === "..")) {
    throw new Error(`Invalid vault relative path: ${relativePath}`);
  }
  const full = resolve(root, cleaned);
  assertInsideVault(root, full);
  return full;
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function fromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({ try: tryFn, catch: asError });
}

/**
 * Exclusive cooperative lock for vault writes (retry with backoff) — Effect primary.
 */
export function withVaultWriteLockEffect<A, E>(
  vaultRoot: string,
  fn: () => Effect.Effect<A, E>
): Effect.Effect<A, E | Error> {
  return Effect.gen(function* () {
    const lockPath = resolveVaultPath(vaultRoot, LOCK_NAME);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    for (let i = 0; i < LOCK_MAX_ATTEMPTS; i++) {
      const openExit = yield* Effect.exit(fromPromise(() => open(lockPath, "wx")));
      if (Exit.isSuccess(openExit)) {
        handle = openExit.value;
        break;
      }
      yield* Effect.sleep(Duration.millis(LOCK_POLL_MS));
    }
    if (!handle) {
      return yield* Effect.fail(
        new Error(
          `Vault write lock timeout after ${LOCK_MAX_ATTEMPTS * LOCK_POLL_MS}ms: ${lockPath}`
        )
      );
    }
    const h = handle;
    return yield* Effect.ensuring(
      fn(),
      fromPromise(async () => {
        await h.close();
        try {
          await unlink(lockPath);
        } catch {
          /* ignore */
        }
      }).pipe(Effect.ignore)
    );
  });
}

/**
 * Promise façade — `fn` may remain Promise-based for erase host edge under lock.
 */
export async function withVaultWriteLock<T>(vaultRoot: string, fn: () => Promise<T>): Promise<T> {
  return Effect.runPromise(withVaultWriteLockEffect(vaultRoot, () => fromPromise(fn)));
}

/** Read vault file as UTF-8; decrypts crypto-shred envelopes when the note key exists. */
export function readVaultTextFileEffect(
  vaultRoot: string,
  relativePath: string
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const p = resolveVaultPath(vaultRoot, relativePath);
    const raw = yield* fromPromise(() => readFile(p, "utf8"));
    return yield* maybeDecryptVaultReadEffect(vaultRoot, raw);
  });
}

/** Promise façade. */
export async function readVaultTextFile(vaultRoot: string, relativePath: string): Promise<string> {
  return Effect.runPromise(readVaultTextFileEffect(vaultRoot, relativePath));
}

/**
 * Raw bytes as stored on disk (ciphertext when crypto-shredding). Used by erase
 * probes that must inspect git history / R2 mirrors without decrypting.
 */
export function readVaultFileRawEffect(
  vaultRoot: string,
  relativePath: string
): Effect.Effect<string, Error> {
  return fromPromise(() => {
    const p = resolveVaultPath(vaultRoot, relativePath);
    return readFile(p, "utf8");
  });
}

/** Promise façade. */
export async function readVaultFileRaw(vaultRoot: string, relativePath: string): Promise<string> {
  return Effect.runPromise(readVaultFileRawEffect(vaultRoot, relativePath));
}

/** Write UTF-8 text; creates parent directories; atomic rename over the final path. */
export function writeVaultTextFileAtomicEffect(
  vaultRoot: string,
  relativePath: string,
  content: string
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const p = resolveVaultPath(vaultRoot, relativePath);
    yield* fromPromise(() => mkdir(dirname(p), { recursive: true }).then(() => undefined));
    let priorNoteId: string | undefined;
    const priorExit = yield* Effect.exit(fromPromise(() => readFile(p, "utf8")));
    if (Exit.isSuccess(priorExit) && isEncryptedVaultEnvelope(priorExit.value)) {
      priorNoteId = extractNoteIdFromEnvelope(priorExit.value);
    }
    const finalContent = yield* maybeEncryptForVaultWriteEffect(vaultRoot, relativePath, content, {
      noteId: priorNoteId,
    });
    const tmp = `${p}.${process.pid}.tmp`;
    yield* fromPromise(() => writeFile(tmp, finalContent, "utf8"));
    yield* fromPromise(() => rename(tmp, p));
  });
}

/** Promise façade. */
export async function writeVaultTextFileAtomic(
  vaultRoot: string,
  relativePath: string,
  content: string
): Promise<void> {
  return Effect.runPromise(writeVaultTextFileAtomicEffect(vaultRoot, relativePath, content));
}

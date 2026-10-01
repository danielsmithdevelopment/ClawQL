/**
 * Safe read/write under an Obsidian vault root with cooperative write locking.
 * When crypto-shredding is enabled, Memory notes are encrypted at rest (git-safe).
 */

import { open, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { maybeDecryptVaultRead, maybeEncryptForVaultWrite } from "../crypto/shred.js";

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

/**
 * Exclusive cooperative lock for vault writes (retry with backoff).
 */
export async function withVaultWriteLock<T>(vaultRoot: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = resolveVaultPath(vaultRoot, LOCK_NAME);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  for (let i = 0; i < LOCK_MAX_ATTEMPTS; i++) {
    try {
      handle = await open(lockPath, "wx");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
    }
  }
  if (!handle) {
    throw new Error(
      `Vault write lock timeout after ${LOCK_MAX_ATTEMPTS * LOCK_POLL_MS}ms: ${lockPath}`
    );
  }
  try {
    return await fn();
  } finally {
    await handle.close();
    try {
      await unlink(lockPath);
    } catch {
      /* ignore */
    }
  }
}

/** Read vault file as UTF-8; decrypts crypto-shred envelopes when the note key exists. */
export async function readVaultTextFile(vaultRoot: string, relativePath: string): Promise<string> {
  const p = resolveVaultPath(vaultRoot, relativePath);
  const raw = await readFile(p, "utf8");
  return maybeDecryptVaultRead(vaultRoot, raw);
}

/**
 * Raw bytes as stored on disk (ciphertext when crypto-shredding). Used by erase
 * probes that must inspect git history / R2 mirrors without decrypting.
 */
export async function readVaultFileRaw(vaultRoot: string, relativePath: string): Promise<string> {
  const p = resolveVaultPath(vaultRoot, relativePath);
  return readFile(p, "utf8");
}

/** Write UTF-8 text; creates parent directories; atomic rename over the final path. */
export async function writeVaultTextFileAtomic(
  vaultRoot: string,
  relativePath: string,
  content: string
): Promise<void> {
  const p = resolveVaultPath(vaultRoot, relativePath);
  await mkdir(dirname(p), { recursive: true });
  let priorNoteId: string | undefined;
  try {
    const prior = await readFile(p, "utf8");
    const { extractNoteIdFromEnvelope, isEncryptedVaultEnvelope } =
      await import("../crypto/shred.js");
    if (isEncryptedVaultEnvelope(prior)) {
      priorNoteId = extractNoteIdFromEnvelope(prior);
    }
  } catch {
    /* new file */
  }
  const finalContent = await maybeEncryptForVaultWrite(vaultRoot, relativePath, content, {
    noteId: priorNoteId,
  });
  const tmp = `${p}.${process.pid}.tmp`;
  await writeFile(tmp, finalContent, "utf8");
  await rename(tmp, p);
}

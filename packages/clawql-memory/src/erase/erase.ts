/**
 * Full memory erasure — vault + derived indexes + crypto-shred key destruction.
 *
 * WORM records opaque pathId + contentHash only (never readable path or body).
 * Erased content hashes land on an export deny-list.
 */

import { unlink } from "node:fs/promises";
import { Effect } from "effect";
import { getObsidianVaultPath } from "../vault/config.js";
import {
  readVaultFileRaw,
  readVaultTextFile,
  resolveVaultPath,
  withVaultWriteLock,
} from "../vault/utils.js";
import { deleteDocumentFromMemoryDb } from "../db/memory-db.js";
import { deletePostgresChunkVectorsByPaths } from "../vector/pgvector.js";
import { deleteOntologyRowsByVaultNotePath } from "../ontology/ontology-erase.js";
import { emitMemoryWormEvent } from "../okf/worm-events.js";
import {
  appendErasureDeny,
  deletePathMapEntry,
  destroyNoteKey,
  extractNoteIdFromEnvelope,
  isEncryptedVaultEnvelope,
  lookupPathMapByPath,
  memoryCryptoShredEnabled,
  sha256Hex,
  upsertPathMapEntry,
} from "../crypto/shred.js";
import { memoryGitBackendEnabled } from "../vault/git-backend.js";

export type MemoryEraseInput = {
  /** Vault-relative path, e.g. Memory/eng/note.md */
  path: string;
  correlationId?: string;
};

export type MemoryEraseStores = {
  vault: boolean;
  memoryDb: boolean;
  pgvector: boolean;
  ontology: boolean;
  /** Per-note encryption key destroyed (crypto-shred). */
  cryptoKey: boolean;
  /** Readable path row removed from erasable path-map. */
  pathMap: boolean;
};

export type MemoryEraseResult = {
  ok: boolean;
  /** Opaque id for WORM / Evidence — never the readable vault path. */
  pathId?: string;
  /** SHA-256 of prior plaintext body. */
  contentHash?: string;
  noteId?: string;
  erased?: MemoryEraseStores;
  /** Deny-list path for export jobs. */
  denyListUpdated?: boolean;
  exportNote?: string;
  error?: string;
};

function normalizeRelPath(path: string): string {
  const cleaned = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.split("/").some((p) => p === "..")) {
    throw new Error(`Invalid vault-relative path: ${path}`);
  }
  return cleaned;
}

/**
 * Erase one vault note and every in-tree derived index copy.
 * Crypto-shred: destroy per-note key so git/R2 history ciphertext is unreadable.
 * WORM: pathId + contentHash only.
 */
export async function executeMemoryEraseCore(input: MemoryEraseInput): Promise<MemoryEraseResult> {
  const vault = getObsidianVaultPath();
  if (!vault) {
    return { ok: false, error: "CLAWQL_OBSIDIAN_VAULT_PATH is not set" };
  }

  let rel: string;
  try {
    rel = normalizeRelPath(input.path);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  let contentHash: string | undefined;
  let noteId: string | undefined;
  let vaultErased = false;
  let cryptoKeyDestroyed = false;
  let pathMapDeleted = false;
  let pathId: string | undefined;

  try {
    await withVaultWriteLock(vault, async () => {
      // Prefer decrypt for contentHash; fall back to raw envelope hash if key already gone.
      try {
        const body = await readVaultTextFile(vault, rel);
        contentHash = sha256Hex(body);
      } catch {
        try {
          const raw = await readVaultFileRaw(vault, rel);
          if (isEncryptedVaultEnvelope(raw)) {
            noteId = extractNoteIdFromEnvelope(raw);
            const hashLine = raw.match(/content_hash:\s*sha256:([a-f0-9]{64})/i);
            if (hashLine?.[1]) contentHash = hashLine[1];
          }
        } catch {
          /* missing */
        }
      }

      try {
        const raw = await readVaultFileRaw(vault, rel);
        if (isEncryptedVaultEnvelope(raw)) {
          noteId = noteId ?? extractNoteIdFromEnvelope(raw);
        }
      } catch {
        /* missing */
      }

      const mapped = await lookupPathMapByPath(vault, rel);
      pathId = mapped?.pathId;
      noteId = noteId ?? mapped?.noteId;
      if (!contentHash && mapped?.contentHash) contentHash = mapped.contentHash;
      if (!pathId) {
        const created = await upsertPathMapEntry(vault, {
          path: rel,
          noteId,
          contentHash,
        });
        pathId = created.pathId;
      }

      const abs = resolveVaultPath(vault, rel);
      try {
        await unlink(abs);
        vaultErased = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/ENOENT|no such file/i.test(msg)) throw e;
      }

      if (noteId) {
        cryptoKeyDestroyed = await destroyNoteKey(vault, noteId);
      } else if (memoryCryptoShredEnabled()) {
        // Plaintext note with no key — shredding cannot scrub git history; still purge stores.
        cryptoKeyDestroyed = false;
      }

      const removed = await deletePathMapEntry(vault, rel);
      pathMapDeleted = Boolean(removed);
      if (removed?.pathId) pathId = removed.pathId;

      await deleteDocumentFromMemoryDb(vault, rel);
      await deletePostgresChunkVectorsByPaths([rel]);
      await deleteOntologyRowsByVaultNotePath(vault, rel);
    });
  } catch (e) {
    return {
      ok: false,
      pathId,
      contentHash,
      noteId,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (contentHash && pathId) {
    await appendErasureDeny(vault, {
      contentHash,
      pathId,
      noteId,
    });
  }

  await emitMemoryWormEvent({
    kind: "MEMORY_RETRACTED",
    at: new Date().toISOString(),
    // Never emit readable vault path — pathId only.
    pathId,
    correlationId: input.correlationId,
    wormRef: contentHash ? `sha256:${contentHash}` : null,
    detail: {
      erasedStores: ["vault", "memory.db", "pgvector", "ontology.db", "note-key", "path-map"],
      contentHash: contentHash ?? null,
      noteId: noteId ?? null,
      cryptoShred: cryptoKeyDestroyed,
      gitHistoryRetainsCiphertextOnly: memoryGitBackendEnabled() || memoryCryptoShredEnabled(),
    },
  });

  return {
    ok: true,
    pathId,
    contentHash,
    noteId,
    erased: {
      vault: vaultErased,
      memoryDb: true,
      pgvector: true,
      ontology: true,
      cryptoKey: cryptoKeyDestroyed,
      pathMap: pathMapDeleted,
    },
    denyListUpdated: Boolean(contentHash && pathId),
    exportNote:
      "Historical training export files on operator disk are out of band; content hash was added to .clawql/erasure-deny.json so new export jobs skip matching hashes. Lineage records show which past exports and fine-tuned models included this content — regenerate those if an erasure request requires it.",
  };
}

/** Effect wrapper for erase. */
export function memoryEraseProgram(
  input: MemoryEraseInput
): Effect.Effect<MemoryEraseResult, never, never> {
  return Effect.tryPromise({
    try: () => executeMemoryEraseCore(input),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  }).pipe(
    Effect.catchAll((e) =>
      Effect.succeed({
        ok: false as const,
        error: e.message,
      })
    )
  );
}

export async function runMemoryErase(input: MemoryEraseInput): Promise<MemoryEraseResult> {
  return Effect.runPromise(memoryEraseProgram(input));
}

/**
 * Probe helpers for tests — return whether residual plaintext needle remains.
 */
export async function memoryContentRecoverableFromStores(opts: {
  vaultRoot: string;
  path: string;
  needle: string;
}): Promise<{
  vault: boolean;
  memoryDb: boolean;
  ontology: boolean;
  gitHistory: boolean;
  /** Simulated R2 = object reachable without the note key (ciphertext only). */
  r2Mirror: boolean;
  keyDestroyed: boolean;
}> {
  const { createRequire } = await import("node:module");
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { resolveMemoryDatabasePath } = await import("../db/memory-db.js");
  const { resolveOntologyDatabasePath } = await import("../ontology/ontology-db.js");
  const { resolveVaultPath } = await import("../vault/utils.js");
  const { noteKeyExists, extractNoteIdFromEnvelope, isEncryptedVaultEnvelope } =
    await import("../crypto/shred.js");

  let vaultHit = false;
  let rawOnDisk = "";
  try {
    // Decrypted read — fails closed after shred.
    const body = await readVaultTextFile(opts.vaultRoot, opts.path);
    vaultHit = body.includes(opts.needle);
  } catch {
    /* missing or key destroyed */
  }
  try {
    rawOnDisk = await readFile(resolveVaultPath(opts.vaultRoot, opts.path), "utf8");
    if (rawOnDisk.includes(opts.needle)) vaultHit = true;
  } catch {
    /* deleted from working tree */
  }

  let noteId: string | undefined;
  if (rawOnDisk && isEncryptedVaultEnvelope(rawOnDisk)) {
    noteId = extractNoteIdFromEnvelope(rawOnDisk);
  }
  const mapped = await lookupPathMapByPath(opts.vaultRoot, opts.path);
  noteId = noteId ?? mapped?.noteId;
  const keyDestroyed = noteId ? !(await noteKeyExists(opts.vaultRoot, noteId)) : true;

  let memoryDbHit = false;
  try {
    const initSqlJs = (await import("sql.js")).default;
    const require = createRequire(import.meta.url);
    const sqlEntry = require.resolve("sql.js");
    const wasmPath = join(dirname(sqlEntry), "sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const absDb = resolveMemoryDatabasePath(opts.vaultRoot);
    const buf = await readFile(absDb);
    const db = new SQL.Database(buf);
    try {
      const rows = db.exec(
        `SELECT text FROM vault_chunk WHERE document_path = '${opts.path.replace(/'/g, "''")}'`
      );
      const texts = (rows[0]?.values ?? []).map((v) => String(v[0] ?? ""));
      memoryDbHit = texts.some((t) => t.includes(opts.needle));
      const docs = db.exec(
        `SELECT path FROM vault_document WHERE path = '${opts.path.replace(/'/g, "''")}'`
      );
      if ((docs[0]?.values?.length ?? 0) > 0 && !memoryDbHit) {
        memoryDbHit = true;
      }
    } finally {
      db.close();
    }
  } catch {
    /* no memory.db */
  }

  let ontologyHit = false;
  try {
    const initSqlJs = (await import("sql.js")).default;
    const require = createRequire(import.meta.url);
    const sqlEntry = require.resolve("sql.js");
    const wasmPath = join(dirname(sqlEntry), "sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const absOnt = resolveOntologyDatabasePath(opts.vaultRoot);
    const buf = await readFile(absOnt);
    const db = new SQL.Database(buf);
    try {
      for (const table of ["matters", "clients", "attorneys", "documents", "dynamic_records"]) {
        try {
          const rows = db.exec(
            `SELECT COUNT(*) FROM ${table} WHERE vault_note_path = '${opts.path.replace(/'/g, "''")}'`
          );
          const n = Number(rows[0]?.values?.[0]?.[0] ?? 0);
          if (n > 0) ontologyHit = true;
        } catch {
          /* table may not exist */
        }
      }
    } finally {
      db.close();
    }
  } catch {
    /* no ontology.db */
  }

  let gitHistoryHit = false;
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", opts.vaultRoot, "log", "-p", "--all", "-S", opts.needle, "--", opts.path],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    // -S finds commits that introduce/remove the string; after crypto-shred the
    // commits only ever contained ciphertext, so needle must not appear.
    gitHistoryHit = stdout.includes(opts.needle);
  } catch {
    /* not a git vault */
  }

  let r2MirrorHit = false;
  try {
    // Simulate R2 = what a remote clone can read from objects without the keystore.
    const { stdout: showOut } = await execFileAsync(
      "git",
      ["-C", opts.vaultRoot, "log", "--all", "--pretty=format:", "--name-only", "--", opts.path],
      { maxBuffer: 4 * 1024 * 1024 }
    );
    if (showOut.trim()) {
      const { stdout: blob } = await execFileAsync(
        "git",
        ["-C", opts.vaultRoot, "log", "-p", "--all", "--", opts.path],
        { maxBuffer: 8 * 1024 * 1024 }
      );
      r2MirrorHit = blob.includes(opts.needle);
    }
  } catch {
    /* not a git vault */
  }

  return {
    vault: vaultHit,
    memoryDb: memoryDbHit,
    ontology: ontologyHit,
    gitHistory: gitHistoryHit,
    r2Mirror: r2MirrorHit,
    keyDestroyed,
  };
}

/**
 * Full memory erasure — vault + derived indexes + crypto-shred key destruction.
 *
 * WORM records opaque pathId + contentHash only (never readable path or body).
 * Erased content hashes land on an export deny-list.
 */

import { unlink } from "node:fs/promises";
import { Cause, Effect, Exit } from "effect";
import type { Named, PrincipalId, VaultPath } from "clawql-gdp";
import {
  eraseAuthorizedEffect,
  type EraseAuthorized,
  type EraseAuthorizedEvidence,
} from "../proofs/erase-authorized.js";

export { eraseAuthorizedEffect, type EraseAuthorized, type EraseAuthorizedEvidence };

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
import {
  appendErasureDenyEffect,
  deletePathMapEntry,
  destroyNoteKey,
  extractNoteIdFromEnvelope,
  isEncryptedVaultEnvelope,
  lookupPathMapByPath,
  memoryCryptoShredEnabled,
  sha256Hex,
  upsertPathMapEntry,
} from "../crypto/shred.js";
import { emitMemoryWormEventEffect } from "../okf/worm-events.js";
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

type EraseLockState = {
  contentHash?: string;
  noteId?: string;
  vaultErased: boolean;
  cryptoKeyDestroyed: boolean;
  pathMapDeleted: boolean;
  pathId?: string;
};

function causeMessage(cause: Cause.Cause<unknown>): string {
  const squashed = Cause.squash(cause);
  if (squashed instanceof Error) return squashed.message;
  return String(squashed);
}

/** Absolute IO inside the vault write lock (Promise only at this host edge). */
async function eraseUnderVaultLock(
  vault: string,
  rel: string,
  state: EraseLockState
): Promise<void> {
  try {
    const body = await readVaultTextFile(vault, rel);
    state.contentHash = sha256Hex(body);
  } catch {
    try {
      const raw = await readVaultFileRaw(vault, rel);
      if (isEncryptedVaultEnvelope(raw)) {
        state.noteId = extractNoteIdFromEnvelope(raw);
        const hashLine = raw.match(/content_hash:\s*sha256:([a-f0-9]{64})/i);
        if (hashLine?.[1]) state.contentHash = hashLine[1];
      }
    } catch {
      /* missing */
    }
  }

  try {
    const raw = await readVaultFileRaw(vault, rel);
    if (isEncryptedVaultEnvelope(raw)) {
      state.noteId = state.noteId ?? extractNoteIdFromEnvelope(raw);
    }
  } catch {
    /* missing */
  }

  const mapped = await lookupPathMapByPath(vault, rel);
  state.pathId = mapped?.pathId;
  state.noteId = state.noteId ?? mapped?.noteId;
  if (!state.contentHash && mapped?.contentHash) state.contentHash = mapped.contentHash;
  if (!state.pathId) {
    const created = await upsertPathMapEntry(vault, {
      path: rel,
      noteId: state.noteId,
      contentHash: state.contentHash,
    });
    state.pathId = created.pathId;
  }

  const abs = resolveVaultPath(vault, rel);
  try {
    await unlink(abs);
    state.vaultErased = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/ENOENT|no such file/i.test(msg)) throw e;
  }

  if (state.noteId) {
    state.cryptoKeyDestroyed = await destroyNoteKey(vault, state.noteId);
  } else if (memoryCryptoShredEnabled()) {
    state.cryptoKeyDestroyed = false;
  }

  const removed = await deletePathMapEntry(vault, rel);
  state.pathMapDeleted = Boolean(removed);
  if (removed?.pathId) state.pathId = removed.pathId;

  await deleteDocumentFromMemoryDb(vault, rel);
  await deletePostgresChunkVectorsByPaths([rel]);
  await deleteOntologyRowsByVaultNotePath(vault, rel);
}

/**
 * Erase one vault note and every in-tree derived index copy (Effect primary).
 * Crypto-shred: destroy per-note key so git/R2 history ciphertext is unreadable.
 * WORM: pathId + contentHash only.
 *
 * Prefer {@link executeMemoryEraseAuthorizedEffect} at trust boundaries — this
 * core remains for internal callers that already hold EraseAuthorized.
 */
export function executeMemoryEraseCoreEffect(
  input: MemoryEraseInput
): Effect.Effect<MemoryEraseResult> {
  return Effect.gen(function* () {
    const vault = getObsidianVaultPath();
    if (!vault) {
      return { ok: false, error: "CLAWQL_OBSIDIAN_VAULT_PATH is not set" };
    }

    const pathExit = yield* Effect.exit(
      Effect.try({
        try: () => normalizeRelPath(input.path),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      })
    );
    if (Exit.isFailure(pathExit)) {
      return { ok: false, error: causeMessage(pathExit.cause) };
    }
    const rel = pathExit.value;

    const state: EraseLockState = {
      vaultErased: false,
      cryptoKeyDestroyed: false,
      pathMapDeleted: false,
    };

    const lockExit = yield* Effect.exit(
      Effect.tryPromise({
        try: () => withVaultWriteLock(vault, () => eraseUnderVaultLock(vault, rel, state)),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      })
    );
    if (Exit.isFailure(lockExit)) {
      return {
        ok: false,
        pathId: state.pathId,
        contentHash: state.contentHash,
        noteId: state.noteId,
        error: causeMessage(lockExit.cause),
      };
    }

    if (state.contentHash && state.pathId) {
      const denyExit = yield* Effect.exit(
        appendErasureDenyEffect(vault, {
          contentHash: state.contentHash!,
          pathId: state.pathId!,
          noteId: state.noteId,
        })
      );
      if (Exit.isFailure(denyExit)) {
        return {
          ok: false,
          pathId: state.pathId,
          contentHash: state.contentHash,
          noteId: state.noteId,
          error: causeMessage(denyExit.cause),
        };
      }
    }

    const wormExit = yield* Effect.exit(
      emitMemoryWormEventEffect({
        kind: "MEMORY_RETRACTED",
        at: new Date().toISOString(),
        pathId: state.pathId,
        correlationId: input.correlationId,
        wormRef: state.contentHash ? `sha256:${state.contentHash}` : null,
        detail: {
          erasedStores: ["vault", "memory.db", "pgvector", "ontology.db", "note-key", "path-map"],
          contentHash: state.contentHash ?? null,
          noteId: state.noteId ?? null,
          cryptoShred: state.cryptoKeyDestroyed,
          gitHistoryRetainsCiphertextOnly: memoryGitBackendEnabled() || memoryCryptoShredEnabled(),
        },
      })
    );
    if (Exit.isFailure(wormExit)) {
      return {
        ok: false,
        pathId: state.pathId,
        contentHash: state.contentHash,
        noteId: state.noteId,
        error: causeMessage(wormExit.cause),
      };
    }

    return {
      ok: true,
      pathId: state.pathId,
      contentHash: state.contentHash,
      noteId: state.noteId,
      erased: {
        vault: state.vaultErased,
        memoryDb: true,
        pgvector: true,
        ontology: true,
        cryptoKey: state.cryptoKeyDestroyed,
        pathMap: state.pathMapDeleted,
      },
      denyListUpdated: Boolean(state.contentHash && state.pathId),
      exportNote:
        "Historical training export files on operator disk are out of band; content hash was added to .clawql/erasure-deny.json so new export jobs skip matching hashes. Lineage records show which past exports and fine-tuned models included this content — regenerate those if an erasure request requires it.",
    };
  });
}

/**
 * Sensitive: erase / crypto-shred a vault path. Demands EraseAuthorized about
 * the exact named principal + path (gdp-ts). `path.value` must equal `input.path`.
 */
export function executeMemoryEraseAuthorizedEffect<P, V>(
  principal: Named<P, PrincipalId>,
  path: Named<V, VaultPath>,
  _proof: EraseAuthorized<P, V>,
  input: MemoryEraseInput
): Effect.Effect<MemoryEraseResult> {
  return Effect.gen(function* () {
    const rel = input.path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (path.value !== rel) {
      return {
        ok: false,
        error: "Named vault path does not match erase input.path",
      };
    }
    if (!principal.value) {
      return { ok: false, error: "Named principal is required for erase" };
    }
    return yield* executeMemoryEraseCoreEffect({ ...input, path: rel });
  });
}

/** Promise façade for callers that still await erase (unproven — tests / legacy). */
export async function executeMemoryEraseCore(input: MemoryEraseInput): Promise<MemoryEraseResult> {
  return Effect.runPromise(executeMemoryEraseCoreEffect(input));
}

/**
 * Effect entry used by MCP / plugin host boundaries that already minted
 * EraseAuthorized.
 */
export function memoryEraseProgram<P, V>(
  principal: Named<P, PrincipalId>,
  path: Named<V, VaultPath>,
  proof: EraseAuthorized<P, V>,
  input: MemoryEraseInput
): Effect.Effect<MemoryEraseResult, never, never> {
  return executeMemoryEraseAuthorizedEffect(principal, path, proof, input);
}

/** @deprecated Prefer proven {@link memoryEraseProgram} / authorized Effect. */
export async function runMemoryErase(input: MemoryEraseInput): Promise<MemoryEraseResult> {
  return Effect.runPromise(executeMemoryEraseCoreEffect(input));
}

export type MemoryRecoverableProbe = {
  vault: boolean;
  memoryDb: boolean;
  ontology: boolean;
  gitHistory: boolean;
  /** Simulated R2 = object reachable without the note key (ciphertext only). */
  r2Mirror: boolean;
  keyDestroyed: boolean;
};

/** Absolute probe IO for tests (Promise only at this host edge). */
async function memoryContentRecoverableFromStoresImpl(opts: {
  vaultRoot: string;
  path: string;
  needle: string;
}): Promise<MemoryRecoverableProbe> {
  const { createRequire } = await import("node:module");
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { resolveMemoryDatabasePath } = await import("../db/memory-db.js");
  const { resolveOntologyDatabasePath } = await import("../ontology/ontology-db.js");
  const { noteKeyExists, extractNoteIdFromEnvelope, isEncryptedVaultEnvelope } =
    await import("../crypto/shred.js");

  let vaultHit = false;
  let rawOnDisk = "";
  try {
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
    gitHistoryHit = stdout.includes(opts.needle);
  } catch {
    /* not a git vault */
  }

  let r2MirrorHit = false;
  try {
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

/** Effect primary for residual-plaintext probes (tests). */
export function memoryContentRecoverableFromStoresEffect(opts: {
  vaultRoot: string;
  path: string;
  needle: string;
}): Effect.Effect<MemoryRecoverableProbe> {
  return Effect.promise(() => memoryContentRecoverableFromStoresImpl(opts));
}

/** Promise façade for test probes. */
export async function memoryContentRecoverableFromStores(opts: {
  vaultRoot: string;
  path: string;
  needle: string;
}): Promise<MemoryRecoverableProbe> {
  return Effect.runPromise(memoryContentRecoverableFromStoresEffect(opts));
}

/**
 * Full memory erasure — vault Markdown + derived copies (memory.db vectors,
 * pgvector, ontology.db). WORM only records path + content hash (never body).
 */

import { createHash } from "node:crypto";
import { unlink } from "node:fs/promises";
import { Effect } from "effect";
import { getObsidianVaultPath } from "../vault/config.js";
import { readVaultTextFile, resolveVaultPath, withVaultWriteLock } from "../vault/utils.js";
import { deleteDocumentFromMemoryDb } from "../db/memory-db.js";
import { deletePostgresChunkVectorsByPaths } from "../vector/pgvector.js";
import { deleteOntologyRowsByVaultNotePath } from "../ontology/ontology-erase.js";
import { emitMemoryWormEvent } from "../okf/worm-events.js";

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
};

export type MemoryEraseResult = {
  ok: boolean;
  path?: string;
  /** SHA-256 of prior vault body — for WORM evidence only (never the content). */
  contentHash?: string;
  erased?: MemoryEraseStores;
  /** Honest note: historical training export files on disk are operator-owned. */
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
 * WORM event carries path + contentHash only.
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
  let vaultErased = false;

  try {
    await withVaultWriteLock(vault, async () => {
      try {
        const body = await readVaultTextFile(vault, rel);
        contentHash = createHash("sha256").update(body, "utf8").digest("hex");
      } catch {
        // Missing vault file — still purge derived stores.
      }

      const abs = resolveVaultPath(vault, rel);
      try {
        await unlink(abs);
        vaultErased = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/ENOENT|no such file/i.test(msg)) throw e;
      }

      await deleteDocumentFromMemoryDb(vault, rel);
      await deletePostgresChunkVectorsByPaths([rel]);
      await deleteOntologyRowsByVaultNotePath(vault, rel);
    });
  } catch (e) {
    return {
      ok: false,
      path: rel,
      contentHash,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  await emitMemoryWormEvent({
    kind: "MEMORY_RETRACTED",
    at: new Date().toISOString(),
    path: rel,
    correlationId: input.correlationId,
    wormRef: contentHash ? `sha256:${contentHash}` : null,
    detail: {
      // References + hashes only — never body text.
      erasedStores: ["vault", "memory.db", "pgvector", "ontology.db"],
      contentHash: contentHash ?? null,
    },
  });

  return {
    ok: true,
    path: rel,
    contentHash,
    erased: {
      vault: vaultErased,
      memoryDb: true,
      pgvector: true,
      ontology: true,
    },
    exportNote:
      "Historical training export artifacts on operator disk are out of band; new exports must not re-materialize deleted vault bodies (manifests hold vaultRef/hash only).",
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
 * Probe helpers for tests — return whether residual content bytes remain.
 * Never used for production gating of erase success alone.
 */
export async function memoryContentRecoverableFromStores(opts: {
  vaultRoot: string;
  path: string;
  needle: string;
}): Promise<{ vault: boolean; memoryDb: boolean; ontology: boolean }> {
  const { createRequire } = await import("node:module");
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { resolveMemoryDatabasePath } = await import("../db/memory-db.js");
  const { resolveOntologyDatabasePath } = await import("../ontology/ontology-db.js");
  const { resolveVaultPath } = await import("../vault/utils.js");

  let vault = false;
  try {
    const body = await readFile(resolveVaultPath(opts.vaultRoot, opts.path), "utf8");
    vault = body.includes(opts.needle);
  } catch {
    vault = false;
  }

  let memoryDb = false;
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
      memoryDb = texts.some((t) => t.includes(opts.needle));
      const docs = db.exec(
        `SELECT path FROM vault_document WHERE path = '${opts.path.replace(/'/g, "''")}'`
      );
      if ((docs[0]?.values?.length ?? 0) > 0 && !memoryDb) {
        // Document row alone without text is still a recoverable pointer — treat as present.
        memoryDb = true;
      }
    } finally {
      db.close();
    }
  } catch {
    memoryDb = false;
  }

  let ontology = false;
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
          if (n > 0) ontology = true;
        } catch {
          /* table may not exist */
        }
      }
    } finally {
      db.close();
    }
  } catch {
    ontology = false;
  }

  return { vault, memoryDb, ontology };
}

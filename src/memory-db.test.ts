import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initSqlJs from "sql.js";
import {
  chunkIdMaybeInMemoryIndex,
  loadVaultMerkleSnapshotFromDb,
  loadWikilinkEdgesFromDatabase,
  resolveMemoryDatabasePath,
  syncMemoryDbFromDocuments,
} from "./memory-db.js";
import { resetMemoryDbArtifactCachesForTests } from "./memory-db-artifact-cache.js";

describe("memory-db", () => {
  const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const savedDbOff = process.env.CLAWQL_MEMORY_DB;
  const savedVector = process.env.CLAWQL_VECTOR_BACKEND;
  const savedKey = process.env.CLAWQL_EMBEDDING_API_KEY;
  const savedCuckoo = process.env.CLAWQL_CUCKOO_ENABLED;
  const savedMerkle = process.env.CLAWQL_MERKLE_ENABLED;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-vault-db-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    delete process.env.CLAWQL_MEMORY_DB;
    delete process.env.CLAWQL_VECTOR_BACKEND;
    delete process.env.CLAWQL_EMBEDDING_API_KEY;
    delete process.env.CLAWQL_CUCKOO_ENABLED;
    delete process.env.CLAWQL_MERKLE_ENABLED;
  });

  afterEach(async () => {
    if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
    if (savedDbOff === undefined) delete process.env.CLAWQL_MEMORY_DB;
    else process.env.CLAWQL_MEMORY_DB = savedDbOff;
    if (savedVector === undefined) delete process.env.CLAWQL_VECTOR_BACKEND;
    else process.env.CLAWQL_VECTOR_BACKEND = savedVector;
    if (savedKey === undefined) delete process.env.CLAWQL_EMBEDDING_API_KEY;
    else process.env.CLAWQL_EMBEDDING_API_KEY = savedKey;
    if (savedCuckoo === undefined) delete process.env.CLAWQL_CUCKOO_ENABLED;
    else process.env.CLAWQL_CUCKOO_ENABLED = savedCuckoo;
    if (savedMerkle === undefined) delete process.env.CLAWQL_MERKLE_ENABLED;
    else process.env.CLAWQL_MERKLE_ENABLED = savedMerkle;
    vi.unstubAllGlobals();
    resetMemoryDbArtifactCachesForTests();
    await rm(dir, { recursive: true, force: true });
  });

  it("resolveMemoryDatabasePath defaults under the vault", () => {
    expect(resolveMemoryDatabasePath(dir).startsWith(dir)).toBe(true);
    expect(resolveMemoryDatabasePath(dir)).toMatch(/memory\.db$/);
  });

  it("syncMemoryDbFromDocuments writes chunks and wikilink edges", async () => {
    await writeFile(
      join(dir, "alpha.md"),
      ["---", "title: A", "---", "", "# Alpha", "", "See [[Beta]].", ""].join("\n"),
      "utf8"
    );
    await writeFile(
      join(dir, "beta.md"),
      ["---", "title: B", "---", "", "# Beta", "", "Body.", ""].join("\n"),
      "utf8"
    );

    const alpha = await readFile(join(dir, "alpha.md"), "utf8");
    const beta = await readFile(join(dir, "beta.md"), "utf8");

    await syncMemoryDbFromDocuments(dir, [
      { path: "alpha.md", text: alpha, mtimeMs: 1 },
      { path: "beta.md", text: beta, mtimeMs: 2 },
    ]);

    const dbPath = resolveMemoryDatabasePath(dir);
    const raw = await readFile(dbPath);
    const require = createRequire(import.meta.url);
    const sqlEntry = require.resolve("sql.js");
    const wasmPath = join(dirname(sqlEntry), "sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const db = new SQL.Database(raw);
    const chunks = db.exec("SELECT COUNT(*) AS c FROM vault_chunk");
    expect(Number(chunks[0]!.values[0]![0])).toBeGreaterThan(0);
    const edges = db.exec(
      "SELECT to_resolved_path FROM wikilink_edge WHERE from_path = 'alpha.md' AND to_target = 'Beta'"
    );
    expect(edges[0]!.values[0]![0]).toBe("beta.md");
    db.close();
  });

  it("loadWikilinkEdgesFromDatabase returns resolved targets", async () => {
    await writeFile(join(dir, "a.md"), "# A\n\n[[b]]\n", "utf8");
    await writeFile(join(dir, "b.md"), "# B\n\n", "utf8");
    const a = await readFile(join(dir, "a.md"), "utf8");
    const b = await readFile(join(dir, "b.md"), "utf8");
    await syncMemoryDbFromDocuments(dir, [
      { path: "a.md", text: a, mtimeMs: 1 },
      { path: "b.md", text: b, mtimeMs: 2 },
    ]);
    const edges = await loadWikilinkEdgesFromDatabase(dir, ["a.md"]);
    expect(edges.some((e) => e.fromPath === "a.md" && e.toPath === "b.md")).toBe(true);
  });

  it("syncMemoryDbFromDocuments stores embeddings when vector backend + mock API", async () => {
    process.env.CLAWQL_VECTOR_BACKEND = "sqlite";
    process.env.CLAWQL_EMBEDDING_API_KEY = "test-key";

    const dim = 8;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: { body?: string }) => {
        const body = init?.body ? (JSON.parse(init.body) as { input?: string[] }) : {};
        const n = Array.isArray(body.input) ? body.input.length : 1;
        return {
          ok: true,
          json: async () => ({
            model: "mock",
            data: Array.from({ length: n }, (_, index) => ({
              index,
              embedding: Array.from({ length: dim }, (_, i) => (i === 0 ? 1 : 0)),
            })),
          }),
        };
      })
    );

    /* Single paragraph → one chunk (avoid \n\n splitting). */
    await writeFile(join(dir, "solo.md"), "Hello world.", "utf8");
    const text = await readFile(join(dir, "solo.md"), "utf8");

    await syncMemoryDbFromDocuments(dir, [{ path: "solo.md", text, mtimeMs: 1 }]);

    const dbPath = resolveMemoryDatabasePath(dir);
    const raw = await readFile(dbPath);
    const require = createRequire(import.meta.url);
    const sqlEntry = require.resolve("sql.js");
    const wasmPath = join(dirname(sqlEntry), "sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const db = new SQL.Database(raw);
    const rows = db.exec(
      "SELECT COUNT(*) AS c FROM vault_chunk WHERE embedding IS NOT NULL AND embedding_model IS NOT NULL"
    );
    expect(Number(rows[0]!.values[0]![0])).toBeGreaterThan(0);
    db.close();
  });

  it("writes Cuckoo and Merkle artifact rows when enabled", async () => {
    process.env.CLAWQL_CUCKOO_ENABLED = "1";
    process.env.CLAWQL_MERKLE_ENABLED = "1";
    await writeFile(join(dir, "a.md"), "# A\n\nHello.", "utf8");
    const text = await readFile(join(dir, "a.md"), "utf8");
    await syncMemoryDbFromDocuments(dir, [{ path: "a.md", text, mtimeMs: 1 }]);

    const dbPath = resolveMemoryDatabasePath(dir);
    const raw = await readFile(dbPath);
    const require = createRequire(import.meta.url);
    const sqlEntry = require.resolve("sql.js");
    const wasmPath = join(dirname(sqlEntry), "sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const db = new SQL.Database(raw);
    const c = db.exec(
      "SELECT length(filter_blob) AS n FROM clawql_cuckoo_chunk_membership WHERE id = 1"
    );
    expect(Number(c[0]!.values[0]![0])).toBeGreaterThan(24);
    const m = db.exec("SELECT root_hex, leaf_count FROM vault_merkle_snapshot WHERE id = 1");
    expect(Number(m[0]!.values[0]![1])).toBe(1);
    expect(String(m[0]!.values[0]![0])).toMatch(/^[0-9a-f]{64}$/);
    const cid = String(db.exec("SELECT chunk_id FROM vault_chunk LIMIT 1")[0]!.values[0]![0]);
    db.close();

    await expect(chunkIdMaybeInMemoryIndex(dir, cid)).resolves.toBe(true);
    await expect(loadVaultMerkleSnapshotFromDb(dir)).resolves.toMatchObject({ leafCount: 1 });
  });
});

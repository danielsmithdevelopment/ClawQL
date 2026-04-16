import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import {
  loadWikilinkEdgesFromDatabase,
  resolveMemoryDatabasePath,
  syncMemoryDbFromDocuments,
} from "./memory-db.js";

describe("memory-db", () => {
  const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const savedDbOff = process.env.CLAWQL_MEMORY_DB;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-vault-db-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    delete process.env.CLAWQL_MEMORY_DB;
  });

  afterEach(async () => {
    if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
    if (savedDbOff === undefined) delete process.env.CLAWQL_MEMORY_DB;
    else process.env.CLAWQL_MEMORY_DB = savedDbOff;
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
});

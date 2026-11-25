import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDuckDb, openDuckDb, queryDuckDb } from "./duckdb-driver.js";
import { validateReadonlySelect } from "../../sql-guard.js";

describe("DuckDB lockdown (4.02)", () => {
  const handles: Array<Awaited<ReturnType<typeof openDuckDb>>> = [];

  afterEach(async () => {
    while (handles.length) {
      const h = handles.pop();
      if (h) await closeDuckDb(h);
    }
  });

  it("blocks read_text of host files on an open query connection", async () => {
    const handle = await openDuckDb(":memory:");
    handles.push(handle);
    await expect(
      queryDuckDb(handle, "SELECT * FROM read_text('/etc/passwd')")
    ).rejects.toThrow(/Permission Error|file system operations are disabled|Cannot access file/i);
  });

  it("blocks https:// replacement scans", async () => {
    const handle = await openDuckDb(":memory:");
    handles.push(handle);
    await expect(queryDuckDb(handle, "SELECT * FROM 'https://example.com/'")).rejects.toThrow();
  });

  it("still allows ordinary SELECT after lock", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-duck-"));
    const dbPath = join(dir, "lab.duckdb");
    const handle = await openDuckDb(dbPath);
    handles.push(handle);
    await handle.connection.run("CREATE TABLE t(x INT); INSERT INTO t VALUES (7)");
    const out = await queryDuckDb(handle, validateReadonlySelect("SELECT x FROM t"));
    expect(out.ok).toBe(true);
    expect(out.rows).toEqual([{ x: 7 }]);
  });

  it("sql-guard rejects read_text before DuckDB runs", () => {
    expect(() => validateReadonlySelect("SELECT * FROM read_text('/etc/passwd')")).toThrow(
      /host files|remote URLs/
    );
  });

  it("does not need a real secret file to refuse glob", async () => {
    const handle = await openDuckDb(":memory:");
    handles.push(handle);
    await expect(queryDuckDb(handle, "SELECT * FROM glob('/**')")).rejects.toThrow(
      /Permission Error|file system|Cannot access/i
    );
    // touch a harmless file so the suite never assumes /etc contents
    const dir = await mkdtemp(join(tmpdir(), "clawql-duck-touch-"));
    await writeFile(join(dir, "x.txt"), "ok\n", "utf8");
  });
});

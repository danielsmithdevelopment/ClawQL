import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMemoryIngestFileMaxBytes,
  getMemoryIngestFileRootsReal,
  isMemoryIngestFileReadEnabled,
  readToolOutputsFileForIngest,
} from "./memory-ingest-file.js";

describe("memory-ingest-file", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_MEMORY_INGEST_FILE = process.env.CLAWQL_MEMORY_INGEST_FILE;
    saved.CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES = process.env.CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES;
    saved.CLAWQL_MEMORY_INGEST_FILE_ROOTS = process.env.CLAWQL_MEMORY_INGEST_FILE_ROOTS;
    delete process.env.CLAWQL_MEMORY_INGEST_FILE;
    delete process.env.CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES;
    delete process.env.CLAWQL_MEMORY_INGEST_FILE_ROOTS;
  });

  afterEach(() => {
    for (const k of Object.keys(saved)) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("isMemoryIngestFileReadEnabled is true unless explicitly disabled", () => {
    delete process.env.CLAWQL_MEMORY_INGEST_FILE;
    expect(isMemoryIngestFileReadEnabled()).toBe(true);
    process.env.CLAWQL_MEMORY_INGEST_FILE = "0";
    expect(isMemoryIngestFileReadEnabled()).toBe(false);
    process.env.CLAWQL_MEMORY_INGEST_FILE = "off";
    expect(isMemoryIngestFileReadEnabled()).toBe(false);
  });

  it("getMemoryIngestFileMaxBytes uses default or parses positive int", () => {
    delete process.env.CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES;
    expect(getMemoryIngestFileMaxBytes()).toBe(10_000_000);
    process.env.CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES = "5000";
    expect(getMemoryIngestFileMaxBytes()).toBe(5000);
    process.env.CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES = "-1";
    expect(getMemoryIngestFileMaxBytes()).toBe(10_000_000);
  });

  it("readToolOutputsFileForIngest rejects when file read disabled", async () => {
    process.env.CLAWQL_MEMORY_INGEST_FILE = "0";
    const r = await readToolOutputsFileForIngest("/any/path");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/disabled/);
  });

  it("readToolOutputsFileForIngest rejects empty path and null byte", async () => {
    const a = await readToolOutputsFileForIngest("  ");
    expect(a.ok).toBe(false);
    const b = await readToolOutputsFileForIngest("/tmp/x\0y");
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error).toMatch(/null/);
  });

  it("readToolOutputsFileForIngest rejects path longer than 4096 chars", async () => {
    const r = await readToolOutputsFileForIngest("x".repeat(4097));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too long/);
  });

  it("getMemoryIngestFileRootsReal falls back to cwd when roots unset", async () => {
    delete process.env.CLAWQL_MEMORY_INGEST_FILE_ROOTS;
    const roots = await getMemoryIngestFileRootsReal();
    expect(roots.length).toBeGreaterThanOrEqual(1);
  });

  it("readToolOutputsFileForIngest reads file under explicit CLAWQL_MEMORY_INGEST_FILE_ROOTS", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ingest-file-"));
    const file = join(dir, "out.txt");
    await writeFile(file, "payload-from-disk\n", "utf8");
    process.env.CLAWQL_MEMORY_INGEST_FILE_ROOTS = dir;
    const r = await readToolOutputsFileForIngest(file);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe("payload-from-disk\n");
      expect(r.displayPath).toBe(file);
    }
  });

  it("readToolOutputsFileForIngest rejects file larger than CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ingest-big-"));
    const file = join(dir, "big.txt");
    await writeFile(file, "x".repeat(100), "utf8");
    process.env.CLAWQL_MEMORY_INGEST_FILE_ROOTS = dir;
    process.env.CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES = "10";
    const r = await readToolOutputsFileForIngest(file);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceeds/);
  });
});

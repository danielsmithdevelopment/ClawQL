import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMemoryDbArtifactCachesForTests } from "./memory-db-artifact-cache.js";
import {
  extractIngestHashes,
  hashIngestSection,
  runMemoryIngest,
  slugifyTitle,
} from "./memory-ingest.js";

describe("memory-ingest", () => {
  const saved = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const savedMerkle = process.env.CLAWQL_MERKLE_ENABLED;
  const savedCuckoo = process.env.CLAWQL_CUCKOO_ENABLED;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-vault-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    delete process.env.CLAWQL_MERKLE_ENABLED;
    delete process.env.CLAWQL_CUCKOO_ENABLED;
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = saved;
    if (savedMerkle === undefined) delete process.env.CLAWQL_MERKLE_ENABLED;
    else process.env.CLAWQL_MERKLE_ENABLED = savedMerkle;
    if (savedCuckoo === undefined) delete process.env.CLAWQL_CUCKOO_ENABLED;
    else process.env.CLAWQL_CUCKOO_ENABLED = savedCuckoo;
    resetMemoryDbArtifactCachesForTests();
    await rm(dir, { recursive: true, force: true });
  });

  it("slugifyTitle produces stable slugs", () => {
    expect(slugifyTitle("Hello World!")).toBe("hello-world");
    expect(slugifyTitle("!!!")).toBe("note");
  });

  it("runMemoryIngest writes Obsidian markdown under Memory", async () => {
    const r = await runMemoryIngest({
      title: "Test Note",
      insights: "Learned something.",
      wikilinks: ["Other"],
    });
    expect(r.ok).toBe(true);
    expect(r.path).toBe("Memory/test-note.md");
    const text = await readFile(join(dir, "Memory", "test-note.md"), "utf8");
    expect(text).toContain("clawql_ingest: true");
    expect(text).toContain("clawql_ingest_created:");
    expect(text).toContain("#### Provenance");
    expect(text).toContain("memory_ingest");
    expect(text).toContain("# Test Note");
    expect(text).toContain("[[Other]]");
    expect(text).toContain("Learned something.");
  });

  it("skips duplicate payload (same hash)", async () => {
    const input = { title: "Dup", insights: "same" };
    const h = hashIngestSection(input);
    expect(h.length).toBe(64);
    const a = await runMemoryIngest(input);
    expect(a.skipped).toBeUndefined();
    const b = await runMemoryIngest(input);
    expect(b.skipped).toBe(true);
  });

  it("append adds a second section", async () => {
    await runMemoryIngest({ title: "Multi", insights: "one" });
    const r = await runMemoryIngest({ title: "Multi", insights: "two" });
    expect(r.skipped).toBeUndefined();
    const text = await readFile(join(dir, "Memory", "multi.md"), "utf8");
    expect(text).toContain("one");
    expect(text).toContain("two");
    const hashes = extractIngestHashes(text);
    expect(hashes.size).toBe(2);
  });

  it("errors when vault not configured", async () => {
    delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    const r = await runMemoryIngest({ title: "X" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/CLAWQL_OBSIDIAN_VAULT_PATH/);
  });

  it("writes memory.db under the vault after successful ingest", async () => {
    const r = await runMemoryIngest({ title: "Indexed", insights: "hello" });
    expect(r.ok).toBe(true);
    await access(join(dir, "memory.db"), constants.R_OK);
  });

  it("includes merkle and cuckoo index fields when env flags are on", async () => {
    process.env.CLAWQL_MERKLE_ENABLED = "1";
    process.env.CLAWQL_CUCKOO_ENABLED = "1";
    const r = await runMemoryIngest({ title: "Artifacts", insights: "probe" });
    expect(r.ok).toBe(true);
    expect(r.merkleSnapshot?.rootHex).toMatch(/^[0-9a-f]{64}$/);
    expect(r.merkleSnapshotBefore).toBeDefined();
    expect(r.merkleRootChanged).toBe(true);
    expect(r.cuckooMembershipReady).toBe(true);
  });
});

/**
 * Full erase: vault + derived stores + crypto-shred; git/R2 history unreadable;
 * WORM pathId only; export deny-list updated.
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runMemoryIngest } from "../ingest/ingest.js";
import { memoryContentRecoverableFromStores, runMemoryErase } from "./erase.js";
import { openOntologyDb, withOntologyWriteLock } from "../ontology/ontology-db.js";
import { registerMemoryWormSink, type MemoryWormEvent } from "../okf/worm-events.js";
import { loadErasureDenyFile, loadErasureDenyHashes, sha256Hex } from "../crypto/shred.js";
import { readVaultFileRaw } from "../vault/utils.js";

const execFileAsync = promisify(execFile);

async function gitInit(vault: string): Promise<void> {
  await execFileAsync("git", ["-C", vault, "init"]);
  await execFileAsync("git", ["-C", vault, "config", "user.email", "erase-test@clawql.local"]);
  await execFileAsync("git", ["-C", vault, "config", "user.name", "Erase Test"]);
}

describe("runMemoryErase", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function stash(key: string): void {
    saved[key] = process.env[key];
  }

  it("crypto-shreds so git/R2 history cannot recover needle; WORM uses pathId; deny-list updated", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-erase-"));
    await gitInit(dir);

    stash("CLAWQL_OBSIDIAN_VAULT_PATH");
    stash("CLAWQL_VECTOR_BACKEND");
    stash("CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY");
    stash("CLAWQL_MEMORY_DB");
    stash("CLAWQL_ONTOLOGY_DB");
    stash("CLAWQL_MEMORY_BACKEND");
    stash("CLAWQL_MEMORY_CRYPTO_SHRED");
    stash("CLAWQL_MEMORY_GIT_COMMIT_ON");
    stash("CLAWQL_MEMORY_GIT_PUSH_MODE");
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    process.env.CLAWQL_VECTOR_BACKEND = "none";
    process.env.CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY = "1";
    process.env.CLAWQL_MEMORY_BACKEND = "git";
    process.env.CLAWQL_MEMORY_CRYPTO_SHRED = "1";
    process.env.CLAWQL_MEMORY_GIT_COMMIT_ON = "ingest";
    process.env.CLAWQL_MEMORY_GIT_PUSH_MODE = "off";
    delete process.env.CLAWQL_MEMORY_DB;
    delete process.env.CLAWQL_ONTOLOGY_DB;

    const needle = `SECRET_ERASURE_TOKEN_${Date.now()}`;
    const ingest = await runMemoryIngest({
      title: "Jane Doe Medical Leave",
      folder: "team",
      insights: `body with ${needle}`,
      type: "context",
    });
    expect(ingest.ok).toBe(true);
    const path = ingest.path!;
    expect(path).toBe("Memory/team/jane-doe-medical-leave.md");

    // Ciphertext on disk — needle must not appear in the working tree file bytes.
    const rawBefore = await readVaultFileRaw(dir, path);
    expect(rawBefore).toContain("CLAWQL_ENCRYPTED_V1:");
    expect(rawBefore).not.toContain(needle);

    // Seed an ontology row pointing at the note.
    await withOntologyWriteLock(dir, async () => {
      const handle = await openOntologyDb(dir);
      expect(handle).not.toBeNull();
      handle!.db.run(
        `INSERT INTO clients (id, name, short_name, industry, tier, vault_note_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["c-erase", "Erase Client", null, null, null, path]
      );
      await handle!.persist();
      handle!.close();
    });

    const before = await memoryContentRecoverableFromStores({
      vaultRoot: dir,
      path,
      needle,
    });
    expect(before.vault).toBe(true);
    expect(before.memoryDb).toBe(true);
    expect(before.ontology).toBe(true);
    // Crypto-shred: plaintext never entered git / R2 mirrors.
    expect(before.gitHistory).toBe(false);
    expect(before.r2Mirror).toBe(false);
    expect(before.keyDestroyed).toBe(false);

    const wormEvents: MemoryWormEvent[] = [];
    const unreg = registerMemoryWormSink((e) => {
      wormEvents.push(e);
    });

    const erased = await runMemoryErase({ path, correlationId: "erase-test" });
    unreg();
    expect(erased.ok).toBe(true);
    expect(erased.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(erased.pathId).toMatch(/^[a-f0-9]{32}$/);
    expect(erased.erased?.cryptoKey).toBe(true);
    expect(erased.erased?.pathMap).toBe(true);
    expect(erased.denyListUpdated).toBe(true);
    expect(erased.exportNote).toMatch(/out of band/i);
    expect(erased.exportNote).toMatch(/erasure-deny/i);

    const after = await memoryContentRecoverableFromStores({
      vaultRoot: dir,
      path,
      needle,
    });
    expect(after.vault).toBe(false);
    expect(after.memoryDb).toBe(false);
    expect(after.ontology).toBe(false);
    expect(after.gitHistory).toBe(false);
    expect(after.r2Mirror).toBe(false);
    expect(after.keyDestroyed).toBe(true);

    // git log -S / show must not surface the needle (R2 mirror = history objects).
    const { stdout: pickaxe } = await execFileAsync(
      "git",
      ["-C", dir, "log", "-p", "--all", "-S", needle],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    expect(pickaxe).not.toContain(needle);
    const { stdout: fullPatch } = await execFileAsync("git", ["-C", dir, "log", "-p", "--all"], {
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(fullPatch).not.toContain(needle);
    expect(fullPatch).toContain("CLAWQL_ENCRYPTED_V1:");

    const retracted = wormEvents.find((e) => e.kind === "MEMORY_RETRACTED");
    expect(retracted).toBeTruthy();
    // Opaque pathId only — never the readable slug path (PII).
    expect(retracted!.path).toBeUndefined();
    expect(retracted!.pathId).toBe(erased.pathId);
    expect(retracted!.wormRef).toBe(`sha256:${erased.contentHash}`);
    const wormJson = JSON.stringify(retracted);
    expect(wormJson).not.toContain(needle);
    expect(wormJson).not.toContain(path);
    expect(wormJson).not.toContain("jane-doe");

    const denied = await loadErasureDenyHashes(dir);
    expect(denied.has(erased.contentHash!)).toBe(true);
    const denyFile = await loadErasureDenyFile(dir);
    expect(denyFile.entries.some((e) => e.pathId === erased.pathId)).toBe(true);
    // Readable path must not live on the permanent deny-list either.
    expect(JSON.stringify(denyFile)).not.toContain(path);

    await expect(readFile(join(dir, path), "utf8")).rejects.toThrow();
  });

  it("removes content from vault, memory.db, and ontology without git when crypto-shred off", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-erase-plain-"));
    stash("CLAWQL_OBSIDIAN_VAULT_PATH");
    stash("CLAWQL_VECTOR_BACKEND");
    stash("CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY");
    stash("CLAWQL_MEMORY_DB");
    stash("CLAWQL_ONTOLOGY_DB");
    stash("CLAWQL_MEMORY_BACKEND");
    stash("CLAWQL_MEMORY_CRYPTO_SHRED");
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    process.env.CLAWQL_VECTOR_BACKEND = "none";
    process.env.CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY = "1";
    process.env.CLAWQL_MEMORY_CRYPTO_SHRED = "0";
    delete process.env.CLAWQL_MEMORY_BACKEND;
    delete process.env.CLAWQL_MEMORY_DB;
    delete process.env.CLAWQL_ONTOLOGY_DB;

    const needle = `PLAIN_ERASE_${Date.now()}`;
    const ingest = await runMemoryIngest({
      title: "Erase Me",
      folder: "eng",
      insights: `body with ${needle}`,
      type: "context",
    });
    expect(ingest.ok).toBe(true);
    const path = ingest.path!;

    await withOntologyWriteLock(dir, async () => {
      const handle = await openOntologyDb(dir);
      handle!.db.run(
        `INSERT INTO clients (id, name, short_name, industry, tier, vault_note_path)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["c-plain", "Plain", null, null, null, path]
      );
      await handle!.persist();
      handle!.close();
    });

    const wormEvents: MemoryWormEvent[] = [];
    const unreg = registerMemoryWormSink((e) => wormEvents.push(e));
    const erased = await runMemoryErase({ path });
    unreg();
    expect(erased.ok).toBe(true);
    expect(erased.pathId).toBeTruthy();

    const after = await memoryContentRecoverableFromStores({
      vaultRoot: dir,
      path,
      needle,
    });
    expect(after.vault).toBe(false);
    expect(after.memoryDb).toBe(false);
    expect(after.ontology).toBe(false);

    const retracted = wormEvents.find((e) => e.kind === "MEMORY_RETRACTED");
    expect(retracted?.path).toBeUndefined();
    expect(retracted?.pathId).toBe(erased.pathId);
    expect(JSON.stringify(retracted)).not.toContain(path);
  });
});

describe("export deny-list hash helper", () => {
  it("sha256 of erased body matches deny entry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-deny-"));
    const body = "training sample that must not reappear";
    const hash = sha256Hex(body);
    await writeFile(
      join(dir, "erasure-deny.json"),
      JSON.stringify({
        version: 1,
        entries: [{ contentHash: hash, pathId: "abc", erasedAt: new Date().toISOString() }],
      }),
      "utf8"
    );
    // loadErasureDenyHashes expects vault/.clawql/erasure-deny.json — use append API path
    const { appendErasureDeny, loadErasureDenyHashes: load } = await import("../crypto/shred.js");
    await appendErasureDeny(dir, { contentHash: hash, pathId: "abc" });
    const set = await load(dir);
    expect(set.has(hash)).toBe(true);
    expect(set.has(sha256Hex("other"))).toBe(false);
  });
});

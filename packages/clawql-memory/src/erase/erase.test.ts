/**
 * Full erase: vault + memory.db + ontology; content unrecoverable; WORM refs only.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runMemoryIngest } from "../ingest/ingest.js";
import {
  memoryContentRecoverableFromStores,
  runMemoryErase,
} from "./erase.js";
import { openOntologyDb, withOntologyWriteLock } from "../ontology/ontology-db.js";
import { registerMemoryWormSink, type MemoryWormEvent } from "../okf/worm-events.js";

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

  it("removes content from vault, memory.db, and ontology; WORM holds hash only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-erase-"));
    stash("CLAWQL_OBSIDIAN_VAULT_PATH");
    stash("CLAWQL_VECTOR_BACKEND");
    stash("CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY");
    stash("CLAWQL_MEMORY_DB");
    stash("CLAWQL_ONTOLOGY_DB");
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    process.env.CLAWQL_VECTOR_BACKEND = "none";
    process.env.CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY = "1";
    delete process.env.CLAWQL_MEMORY_DB;
    delete process.env.CLAWQL_ONTOLOGY_DB;

    const needle = `SECRET_ERASURE_TOKEN_${Date.now()}`;
    const ingest = await runMemoryIngest({
      title: "Erase Me",
      folder: "eng",
      insights: `body with ${needle}`,
      type: "context",
    });
    expect(ingest.ok).toBe(true);
    const path = ingest.path!;
    expect(path).toBe("Memory/eng/erase-me.md");

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

    const wormEvents: MemoryWormEvent[] = [];
    const unreg = registerMemoryWormSink((e) => {
      wormEvents.push(e);
    });

    const erased = await runMemoryErase({ path, correlationId: "erase-test" });
    unreg();
    expect(erased.ok).toBe(true);
    expect(erased.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(erased.exportNote).toMatch(/out of band/i);

    const after = await memoryContentRecoverableFromStores({
      vaultRoot: dir,
      path,
      needle,
    });
    expect(after.vault).toBe(false);
    expect(after.memoryDb).toBe(false);
    expect(after.ontology).toBe(false);

    const retracted = wormEvents.find((e) => e.kind === "MEMORY_RETRACTED");
    expect(retracted).toBeTruthy();
    expect(retracted!.path).toBe(path);
    expect(retracted!.wormRef).toBe(`sha256:${erased.contentHash}`);
    // WORM must not carry vault body
    expect(JSON.stringify(retracted)).not.toContain(needle);

    // Double-check vault file gone
    await expect(readFile(join(dir, path), "utf8")).rejects.toThrow();
  });
});

/**
 * Lazy vault sync must stay cheap at B-7.1 scale (120 notes) so the agent's
 * turn budget is not eaten by indexing.
 */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureOntologyMattersIndexed, runOntologyRecall } from "./ontology-query.js";

describe("ontology lazy sync @ 120 notes", () => {
  let vault: string;
  const prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const prevOnt = process.env.CLAWQL_ONTOLOGY_DB;

  beforeEach(async () => {
    vault = await mkdtemp(join(tmpdir(), "clawql-ont-120-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vault;
    delete process.env.CLAWQL_ONTOLOGY_DB;
    await mkdir(join(vault, "Memory"), { recursive: true });
    for (let i = 0; i < 120; i++) {
      const id = `MAT-${String(2600 + i).padStart(4, "0")}`;
      const escrow = i < 5 ? 12 + i : i === 10 ? 9 : 11;
      const nc = i < 5 ? 24 : i === 11 ? 18 : 12;
      const body = [
        `# ${id}`,
        "",
        `CLAWQL_MATTER_ID=${id}`,
        `CLAWQL_ESCROW_PCT=${escrow}`,
        `CLAWQL_NONCOMPETE_MONTHS=${nc}`,
        "",
      ].join("\n");
      await writeFile(join(vault, "Memory", `${id}.md`), body, "utf8");
    }
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    if (prevOnt === undefined) delete process.env.CLAWQL_ONTOLOGY_DB;
    else process.env.CLAWQL_ONTOLOGY_DB = prevOnt;
    await rm(vault, { recursive: true, force: true });
  });

  it("indexes 120 notes well under the 60s efficiency cap", async () => {
    const t0 = Date.now();
    await ensureOntologyMattersIndexed(vault);
    const ms = Date.now() - t0;
    // Budget: leave ≥30s of a 60s wall for the agent turn. Local WASM sync
    // of 120 small notes should be far below 5s on CI runners.
    expect(ms).toBeLessThan(5_000);
    // eslint-disable-next-line no-console
    console.log(`lazy sync 120 notes: ${ms}ms`);
  });

  it("serializes concurrent empty-table recalls via write lock", async () => {
    const results = await Promise.all(
      [0, 1, 2].map(() =>
        runOntologyRecall(vault, {
          query: "concurrent escrow filter",
          schema: "legal.Matter",
          filters: { escrowPct: { gte: 10 }, nonCompeteMonths: { gt: 18 } },
          limit: 20,
        })
      )
    );
    for (const r of results) {
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.scannedEntities).toBe(120);
        expect(r.filteredEntities).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("returns ontology_disabled when CLAWQL_ONTOLOGY_DB=0", async () => {
    process.env.CLAWQL_ONTOLOGY_DB = "0";
    const r = await runOntologyRecall(vault, {
      query: "hint",
      schema: "legal.Matter",
      filters: { escrowPct: { gte: 10 } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorType).toBe("ontology_disabled");
      expect(r.error).toContain("CLAWQL_ONTOLOGY_DB=0");
    }
  });
});

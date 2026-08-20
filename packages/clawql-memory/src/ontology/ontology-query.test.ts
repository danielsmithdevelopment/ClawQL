import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runOntologyRecall } from "./ontology-query.js";

const GT = ["MAT-2388", "MAT-2401", "MAT-2415", "MAT-2450", "MAT-2462"] as const;

const FIXTURE: Array<{ id: string; escrow: number; nc: number }> = [
  { id: "MAT-2388", escrow: 15, nc: 24 },
  { id: "MAT-2401", escrow: 12, nc: 24 },
  { id: "MAT-2415", escrow: 18, nc: 36 },
  { id: "MAT-2450", escrow: 10, nc: 20 },
  { id: "MAT-2462", escrow: 22, nc: 24 },
  { id: "MAT-2433", escrow: 9, nc: 24 }, // near-miss escrow
  { id: "MAT-2441", escrow: 12, nc: 12 }, // near-miss NC
];

describe("runOntologyRecall B-7.1", () => {
  let vault: string;
  const prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const prevOnt = process.env.CLAWQL_ONTOLOGY_DB;

  beforeEach(async () => {
    vault = await mkdtemp(join(tmpdir(), "clawql-ontology-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vault;
    delete process.env.CLAWQL_ONTOLOGY_DB;
    await mkdir(join(vault, "Memory"), { recursive: true });
    for (const m of FIXTURE) {
      const body = [
        `# ${m.id}`,
        "",
        "CLAWQL_MATTER_ID=" + m.id,
        "CLAWQL_ESCROW_PCT=" + m.escrow,
        "CLAWQL_NONCOMPETE_MONTHS=" + m.nc,
        "CLAWQL_STATUS=Active",
        "",
      ].join("\n");
      await writeFile(join(vault, "Memory", `${m.id}.md`), body, "utf8");
    }
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    if (prevOnt === undefined) delete process.env.CLAWQL_ONTOLOGY_DB;
    else process.env.CLAWQL_ONTOLOGY_DB = prevOnt;
    await rm(vault, { recursive: true, force: true });
  });

  it("returns exact five matches and excludes near-misses", async () => {
    const result = await runOntologyRecall(vault, {
      query: "matters with escrow and non-compete clauses",
      schema: "legal.Matter",
      filters: {
        escrowPct: { gte: 10 },
        nonCompeteMonths: { gt: 18 },
      },
      confidenceMinimum: "EXTRACTED",
      limit: 20,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.queryType).toBe("structured_predicate");
    expect(result.indexUsed).toBe("ontology");
    expect(result.filteredEntities).toBe(5);
    expect(result.hits.map((h) => h.entityId).sort()).toEqual([...GT].sort());
    expect(result.hits.map((h) => h.entityId)).not.toContain("MAT-2433");
    expect(result.hits.map((h) => h.entityId)).not.toContain("MAT-2441");
    expect(result.hits.every((h) => (h.fields.escrowPct as number) >= 10)).toBe(true);
    expect(result.hits.every((h) => (h.fields.nonCompeteMonths as number) > 18)).toBe(true);
    expect(result.results.every((r) => r.reason === "structured_predicate")).toBe(true);
  });
});

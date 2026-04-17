import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMemoryDbArtifactCachesForTests } from "./memory-db-artifact-cache.js";
import { syncMemoryDbFromDocuments } from "./memory-db.js";
import { extractWikilinkTargets, keywordScore, runMemoryRecall } from "./memory-recall.js";

describe("memory-recall helpers", () => {
  it("keywordScore sums token matches", () => {
    expect(keywordScore("hello world", "Hello hello WORLD")).toBeGreaterThan(0);
  });

  it("extractWikilinkTargets parses Obsidian links", () => {
    expect(extractWikilinkTargets("See [[Foo Bar]] and [[x|alias]]")).toEqual(["Foo Bar", "x"]);
  });
});

describe("memory-recall vault", () => {
  const saved = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const savedMerkle = process.env.CLAWQL_MERKLE_ENABLED;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-vault-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    await mkdir(join(dir, "Memory"), { recursive: true });
    await writeFile(
      join(dir, "Memory/alpha.md"),
      [
        "---",
        'title: "Alpha"',
        "---",
        "",
        "# Alpha",
        "",
        "Discuss [[Beta Page]] here.",
        "",
        "GitHub API patterns for PAT rotation.",
        "",
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(dir, "Memory/beta-page.md"),
      ["---", 'title: "Beta"', "---", "", "# Beta Page", "", "Secondary note body.", ""].join("\n"),
      "utf8"
    );
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = saved;
    if (savedMerkle === undefined) delete process.env.CLAWQL_MERKLE_ENABLED;
    else process.env.CLAWQL_MERKLE_ENABLED = savedMerkle;
    resetMemoryDbArtifactCachesForTests();
    await rm(dir, { recursive: true, force: true });
  });

  it("finds keyword hits and follows wikilinks", async () => {
    const r = await runMemoryRecall({
      query: "github pat",
      limit: 10,
      maxDepth: 2,
      minScore: 1,
    });
    expect(r.ok).toBe(true);
    expect(r.results?.length).toBeGreaterThanOrEqual(2);
    const paths = r.results!.map((x) => x.path);
    expect(paths.some((p) => p.includes("alpha.md"))).toBe(true);
    expect(paths.some((p) => p.includes("beta-page.md"))).toBe(true);
    const beta = r.results!.find((x) => x.path.endsWith("beta-page.md"));
    expect(beta?.reason).toBe("link");
    expect(beta?.linkFrom).toMatch(/alpha\.md$/);
  });

  it("errors when vault unset", async () => {
    delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    const r = await runMemoryRecall({ query: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/CLAWQL_OBSIDIAN_VAULT_PATH/);
  });

  it("includes merkleSnapshot when CLAWQL_MERKLE_ENABLED and memory.db has a row", async () => {
    process.env.CLAWQL_MERKLE_ENABLED = "1";
    const alpha = await readFile(join(dir, "Memory/alpha.md"), "utf8");
    const beta = await readFile(join(dir, "Memory/beta-page.md"), "utf8");
    await syncMemoryDbFromDocuments(dir, [
      { path: "Memory/alpha.md", text: alpha, mtimeMs: 1 },
      { path: "Memory/beta-page.md", text: beta, mtimeMs: 2 },
    ]);

    const r = await runMemoryRecall({ query: "github" });
    expect(r.ok).toBe(true);
    expect(r.merkleSnapshot).toBeDefined();
    expect(r.merkleSnapshot?.rootHex).toMatch(/^[0-9a-f]{64}$/);
    expect(r.merkleSnapshot?.leafCount).toBe(2);
  });
});

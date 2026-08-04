import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMemoryDbArtifactCachesForTests } from "clawql-memory";
import { syncMemoryDbFromDocuments } from "clawql-memory/db/memory-db";
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
  const savedVector = process.env.CLAWQL_VECTOR_BACKEND;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-vault-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    // Keep unit tests off the default local ONNX path (no model download in CI).
    process.env.CLAWQL_VECTOR_BACKEND = "off";
    // Keep unit tests off the default local ONNX path (no model download in CI).
    process.env.CLAWQL_VECTOR_BACKEND = "off";
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
    if (savedVector === undefined) delete process.env.CLAWQL_VECTOR_BACKEND;
    else process.env.CLAWQL_VECTOR_BACKEND = savedVector;
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
    expect(r.hits?.length).toBeGreaterThanOrEqual(2);
    expect(r.sourcesUsed).toEqual(expect.arrayContaining(["vault", "vector"]));
    expect(r.hits!.some((h) => h.source === "vault" || h.source === "link")).toBe(true);
  });

  it("still surfaces wikilink neighbors when many keyword seeds compete", async () => {
    // Flood the corpus with notes that share a common token so seeds >> limit.
    for (let i = 0; i < 30; i++) {
      await writeFile(
        join(dir, `Memory/noise-${i}.md`),
        `# Noise ${i}\n\nchainlink chainlink network feed ${i}\n`,
        "utf8"
      );
    }
    await writeFile(
      join(dir, "Memory/hub.md"),
      "# Hub\n\nchainlink hub discusses [[Beta Page]] and github.\n",
      "utf8"
    );
    const r = await runMemoryRecall({
      query: "chainlink github",
      limit: 5,
      maxDepth: 2,
      minScore: 0.1,
      sources: ["vault"],
    });
    expect(r.ok).toBe(true);
    const linkHit = r.results?.find((x) => x.reason === "link");
    expect(linkHit).toBeDefined();
    expect(linkHit?.path).toMatch(/beta-page\.md$/);
  });

  it("honors sources=[vault] without requiring pageindex/onyx", async () => {
    const r = await runMemoryRecall({
      query: "github pat",
      sources: ["vault"],
      maxDepth: 1,
    });
    expect(r.ok).toBe(true);
    expect(r.sourcesUsed).toEqual(["vault"]);
    expect(r.hits?.every((h) => h.source === "vault" || h.source === "link")).toBe(true);
    expect(r.codeGraphHits).toBeUndefined();
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

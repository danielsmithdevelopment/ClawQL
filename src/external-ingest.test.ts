import { access } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMemoryDbArtifactCachesForTests } from "./memory-db-artifact-cache.js";
import { syncMemoryDbFromDocuments } from "./memory-db.js";
import { runIngestExternalKnowledge } from "./external-ingest.js";

describe("external-ingest", () => {
  const saved = process.env.CLAWQL_EXTERNAL_INGEST;
  const savedFetch = process.env.CLAWQL_EXTERNAL_INGEST_FETCH;
  const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const savedMerkle = process.env.CLAWQL_MERKLE_ENABLED;
  const savedCuckoo = process.env.CLAWQL_CUCKOO_ENABLED;

  beforeEach(() => {
    delete process.env.CLAWQL_EXTERNAL_INGEST;
    delete process.env.CLAWQL_EXTERNAL_INGEST_FETCH;
    delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    delete process.env.CLAWQL_MERKLE_ENABLED;
    delete process.env.CLAWQL_CUCKOO_ENABLED;
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env.CLAWQL_EXTERNAL_INGEST;
    else process.env.CLAWQL_EXTERNAL_INGEST = saved;
    if (savedFetch === undefined) delete process.env.CLAWQL_EXTERNAL_INGEST_FETCH;
    else process.env.CLAWQL_EXTERNAL_INGEST_FETCH = savedFetch;
    if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
    if (savedMerkle === undefined) delete process.env.CLAWQL_MERKLE_ENABLED;
    else process.env.CLAWQL_MERKLE_ENABLED = savedMerkle;
    if (savedCuckoo === undefined) delete process.env.CLAWQL_CUCKOO_ENABLED;
    else process.env.CLAWQL_CUCKOO_ENABLED = savedCuckoo;
    resetMemoryDbArtifactCachesForTests();
  });

  it("returns disabled stub when feature flag unset", async () => {
    const r = await runIngestExternalKnowledge({ source: "notion" });
    expect(r.stub).toBe(true);
    expect(r.enabled).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/CLAWQL_EXTERNAL_INGEST/);
  });

  it("returns roadmap stub when enabled but no payload", async () => {
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    const r = await runIngestExternalKnowledge({ source: "github", dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.stub).toBe(true);
    expect(r.enabled).toBe(true);
    expect(r.roadmap?.length).toBeGreaterThan(0);
    expect(r.relatedIssues).toContain(40);
    expect(r.message).toMatch(/No import payload/);
  });

  it("includes merkleSnapshot when vault has memory.db and Merkle is enabled (preview)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ext-"));
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    process.env.CLAWQL_MERKLE_ENABLED = "1";
    process.env.CLAWQL_CUCKOO_ENABLED = "1";
    await mkdir(join(dir, "Memory"), { recursive: true });
    await writeFile(join(dir, "Memory/stub.md"), "# S\n", "utf8");
    const text = await readFile(join(dir, "Memory/stub.md"), "utf8");
    await syncMemoryDbFromDocuments(dir, [{ path: "Memory/stub.md", text, mtimeMs: 1 }]);
    const r = await runIngestExternalKnowledge({ source: "notion" });
    expect(r.merkleSnapshot?.rootHex).toMatch(/^[0-9a-f]{64}$/);
    expect(r.cuckooMembershipReady).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it("dryRun markdown lists paths without writing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ext-"));
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    await mkdir(join(dir, "Memory"), { recursive: true });
    const r = await runIngestExternalKnowledge({
      dryRun: true,
      documents: [{ path: "Memory/in/dry.md", markdown: "# X\n" }],
    });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(r.importedPaths).toEqual(["Memory/in/dry.md"]);
    await expect(access(join(dir, "Memory/in/dry.md"))).rejects.toThrow();
    await rm(dir, { recursive: true, force: true });
  });

  it("imports markdown documents when dryRun false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ext-"));
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    await mkdir(join(dir, "Memory"), { recursive: true });
    const r = await runIngestExternalKnowledge({
      source: "markdown",
      dryRun: false,
      documents: [
        { path: "Memory/ext/a.md", markdown: "# Hello\n" },
        { path: "Memory/ext/b.md", markdown: "## B\n" },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(false);
    expect(r.importedPaths?.sort()).toEqual(["Memory/ext/a.md", "Memory/ext/b.md"]);
    expect(await readFile(join(dir, "Memory/ext/a.md"), "utf8")).toContain("# Hello");
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects url fetch when CLAWQL_EXTERNAL_INGEST_FETCH is unset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ext-"));
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    await mkdir(join(dir, "Memory"), { recursive: true });
    const r = await runIngestExternalKnowledge({
      source: "url",
      url: "https://example.com/x",
      dryRun: false,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("fetch_disabled");
    await rm(dir, { recursive: true, force: true });
  });

  it("fetches localhost http when fetch enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ext-"));
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    process.env.CLAWQL_EXTERNAL_INGEST_FETCH = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    await mkdir(join(dir, "Memory"), { recursive: true });

    const server: Server = createServer((_, res) => {
      res.setHeader("Content-Type", "text/plain");
      res.end("hello from stub");
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected port");
    const port = addr.port;

    try {
      const r = await runIngestExternalKnowledge({
        source: "url",
        url: `http://127.0.0.1:${port}/doc`,
        dryRun: false,
        scope: "Memory/external/fetched.md",
      });
      expect(r.ok).toBe(true);
      expect(r.importedPaths).toEqual(["Memory/external/fetched.md"]);
      const body = await readFile(join(dir, "Memory/external/fetched.md"), "utf8");
      expect(body).toContain("hello from stub");
      expect(body).toContain("clawql_external_ingest");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await rm(dir, { recursive: true, force: true });
  });

  it("collects per-document errors without failing other paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-ext-"));
    process.env.CLAWQL_EXTERNAL_INGEST = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    await mkdir(join(dir, "Memory"), { recursive: true });
    const r = await runIngestExternalKnowledge({
      dryRun: false,
      documents: [
        { path: "Memory/good.md", markdown: "ok" },
        { path: "bad.txt", markdown: "x" },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.importedPaths).toEqual(["Memory/good.md"]);
    expect(r.documentErrors?.some((e) => e.path === "bad.txt")).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});

import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMemoryIngest } from "./memory-ingest.js";
import { updateProviderIndexPage } from "./memory-provider-index.js";

describe("memory-provider-index", () => {
  const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const savedIndexPage = process.env.CLAWQL_MEMORY_INDEX_PAGE;
  const savedProvider = process.env.CLAWQL_MEMORY_INDEX_PROVIDER;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-vault-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    await mkdir(join(dir, "Memory"), { recursive: true });
    delete process.env.CLAWQL_MEMORY_INDEX_PAGE;
    delete process.env.CLAWQL_MEMORY_INDEX_PROVIDER;
  });

  afterEach(async () => {
    if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
    if (savedIndexPage === undefined) delete process.env.CLAWQL_MEMORY_INDEX_PAGE;
    else process.env.CLAWQL_MEMORY_INDEX_PAGE = savedIndexPage;
    if (savedProvider === undefined) delete process.env.CLAWQL_MEMORY_INDEX_PROVIDER;
    else process.env.CLAWQL_MEMORY_INDEX_PROVIDER = savedProvider;
    await rm(dir, { recursive: true, force: true });
  });

  it("writes _INDEX page listing notes after updateProviderIndexPage", async () => {
    await writeFile(
      join(dir, "Memory", "alpha.md"),
      ["# Alpha Note", "", "body", ""].join("\n"),
      "utf8"
    );
    await writeFile(join(dir, "Memory", "beta.md"), ["# Beta", "", "x", ""].join("\n"), "utf8");
    await updateProviderIndexPage(dir);
    const idx = await readFile(join(dir, "Memory", "_INDEX_ClawQL.md"), "utf8");
    expect(idx).toContain("clawql_generated: provider_index");
    expect(idx).toContain("## Summary");
    expect(idx).toContain("## By folder");
    expect(idx).toContain("## All notes (A–Z)");
    expect(idx).toContain("[[Alpha Note]]");
    expect(idx).toContain("[[Beta]]");
    expect(idx).toContain("`Memory/`");
  });

  it("skips second write when content unchanged", async () => {
    await writeFile(join(dir, "Memory", "only.md"), ["# Only", "", "x", ""].join("\n"), "utf8");
    await updateProviderIndexPage(dir);
    const t1 = await readFile(join(dir, "Memory", "_INDEX_ClawQL.md"), "utf8");
    await updateProviderIndexPage(dir);
    const t2 = await readFile(join(dir, "Memory", "_INDEX_ClawQL.md"), "utf8");
    expect(t2).toBe(t1);
  });

  it("respects CLAWQL_MEMORY_INDEX_PAGE=0", async () => {
    process.env.CLAWQL_MEMORY_INDEX_PAGE = "0";
    await writeFile(join(dir, "Memory", "n.md"), ["# N", ""].join("\n"), "utf8");
    await updateProviderIndexPage(dir);
    await expect(access(join(dir, "Memory", "_INDEX_ClawQL.md"), constants.R_OK)).rejects.toThrow();
  });

  it("runMemoryIngest creates index page by default", async () => {
    const r = await runMemoryIngest({ title: "Hello", insights: "x" });
    expect(r.ok).toBe(true);
    const idx = await readFile(join(dir, "Memory", "_INDEX_ClawQL.md"), "utf8");
    expect(idx).toContain("[[Hello]]");
  });

  it("groups notes by parent folder", async () => {
    await mkdir(join(dir, "Memory", "team-a"), { recursive: true });
    await writeFile(
      join(dir, "Memory", "team-a", "note.md"),
      ["# Team A Note", "", "x", ""].join("\n"),
      "utf8"
    );
    await writeFile(join(dir, "Memory", "root.md"), ["# Root", "", "y", ""].join("\n"), "utf8");
    await updateProviderIndexPage(dir);
    const idx = await readFile(join(dir, "Memory", "_INDEX_ClawQL.md"), "utf8");
    expect(idx).toContain("`Memory/team-a/`");
    expect(idx).toContain("[[Team A Note]]");
    expect(idx).toContain("`Memory/`");
  });

  it("uses CLAWQL_MEMORY_INDEX_PROVIDER in filename", async () => {
    process.env.CLAWQL_MEMORY_INDEX_PROVIDER = "Acme";
    await writeFile(join(dir, "Memory", "z.md"), ["# Z", ""].join("\n"), "utf8");
    await updateProviderIndexPage(dir);
    const idx = await readFile(join(dir, "Memory", "_INDEX_Acme.md"), "utf8");
    expect(idx).toContain("# Index — Acme");
  });
});

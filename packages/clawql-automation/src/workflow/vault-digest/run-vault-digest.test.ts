import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVaultDailyDigest } from "./run-vault-digest.js";

describe("runVaultDailyDigest", () => {
  let vaultDir: string;
  const prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;

  afterEach(() => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
  });

  it("skips when no notes in window", async () => {
    vaultDir = await mkdtemp(join(tmpdir(), "clawql-vault-digest-"));
    await mkdir(join(vaultDir, "Memory"), { recursive: true });
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vaultDir;

    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await writeFile(
      join(vaultDir, "Memory", "old-note.md"),
      `---\ntitle: "Old"\ntags: [clawql-ingest]\nclawql_ingest: true\nclawql_ingest_created: ${JSON.stringify(old)}\n---\n\n# Old\n\n#### Insights\n\nStale.\n`
    );

    const result = await runVaultDailyDigest({ hoursBack: 24 });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.sourceCount).toBe(0);
  });

  it("ingests digest for recent notes", async () => {
    vaultDir = await mkdtemp(join(tmpdir(), "clawql-vault-digest-"));
    await mkdir(join(vaultDir, "Memory"), { recursive: true });
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vaultDir;

    const recent = new Date().toISOString();
    await writeFile(
      join(vaultDir, "Memory", "alpha.md"),
      `---\ntitle: "Alpha"\ntags: [clawql-ingest]\nclawql_ingest: true\nclawql_ingest_created: ${JSON.stringify(recent)}\n---\n\n# Alpha\n\n#### Insights\n\nFirst insight.\n`
    );
    await writeFile(
      join(vaultDir, "Memory", "beta.md"),
      `---\ntitle: "Beta"\ntags: [clawql-ingest]\nclawql_ingest: true\nclawql_ingest_created: ${JSON.stringify(recent)}\n---\n\n# Beta\n\n#### Insights\n\nSecond insight.\n`
    );

    const result = await runVaultDailyDigest({ hoursBack: 24 });
    expect(result.ok).toBe(true);
    expect(result.sourceCount).toBe(2);
    expect(result.digestPath).toMatch(/Memory\/vault-digest/);
    expect(result.digestTitle).toMatch(/^Vault digest — /);
  });
});

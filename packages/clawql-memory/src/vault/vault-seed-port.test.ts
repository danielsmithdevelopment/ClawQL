import { access, readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClawQLApi, createHandoffSkillPlugin } from "clawql-api";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryVaultSeedLive } from "./vault-seed-port.js";

describe("MemoryVaultSeedLive", () => {
  const previousVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  let vaultDir: string | undefined;

  afterEach(() => {
    if (previousVault === undefined) {
      delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    } else {
      process.env.CLAWQL_OBSIDIAN_VAULT_PATH = previousVault;
    }
    if (vaultDir) {
      rmSync(vaultDir, { recursive: true, force: true });
      vaultDir = undefined;
    }
  });

  it("is runSync-safe and seeds the handoff note asynchronously", async () => {
    vaultDir = mkdtempSync(join(tmpdir(), "clawql-vault-seed-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vaultDir;

    expect(() =>
      createClawQLApi({
        plugins: [createHandoffSkillPlugin()],
        vaultSeedLayer: MemoryVaultSeedLive,
      })
    ).not.toThrow();

    const target = join(vaultDir, "Memory", "handoff-skill-pack.md");
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      try {
        await access(target);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    await access(target);
    const text = await readFile(target, "utf8");
    expect(text).toContain("Session handoff");
    expect(text).toMatch(/clawql-plugin:handoff/);
  });
});

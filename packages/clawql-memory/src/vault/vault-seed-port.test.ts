import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClawQLApi, createHandoffSkillPlugin } from "clawql-api";
import { describe, expect, it, afterEach } from "vitest";
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

  it("is runSync-safe under createClawQLApi when vault path is set (Docker MCP smoke)", () => {
    vaultDir = mkdtempSync(join(tmpdir(), "clawql-vault-seed-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vaultDir;

    expect(() =>
      createClawQLApi({
        plugins: [createHandoffSkillPlugin()],
        vaultSeedLayer: MemoryVaultSeedLive,
      })
    ).not.toThrow();
  });
});

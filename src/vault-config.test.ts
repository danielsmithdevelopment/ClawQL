import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getObsidianVaultPath,
  validateObsidianVaultAtStartup,
} from "./vault-config.js";

describe("vault-config", () => {
  const saved: Record<string, string | undefined> = {};
  const dirs: string[] = [];

  beforeEach(() => {
    saved.CLAWQL_OBSIDIAN_VAULT_PATH = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  });

  afterEach(async () => {
    for (const key of Object.keys(saved)) {
      const v = saved[key as keyof typeof saved];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    for (const d of dirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("getObsidianVaultPath returns null when unset", () => {
    expect(getObsidianVaultPath()).toBeNull();
  });

  it("getObsidianVaultPath resolves when set", async () => {
    const d = await mkdtemp(join(tmpdir(), "clawql-vault-"));
    dirs.push(d);
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = d;
    expect(getObsidianVaultPath()).toBe(resolve(d));
  });

  it("validateObsidianVaultAtStartup passes for writable directory", async () => {
    const d = await mkdtemp(join(tmpdir(), "clawql-vault-"));
    dirs.push(d);
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = d;
    await expect(validateObsidianVaultAtStartup()).resolves.toBeUndefined();
  });

  it("validateObsidianVaultAtStartup rejects missing path", async () => {
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = join(tmpdir(), "definitely-missing-vault-xyz");
    await expect(validateObsidianVaultAtStartup()).rejects.toThrow(/does not exist/);
  });

  it("validateObsidianVaultAtStartup rejects file", async () => {
    const d = await mkdtemp(join(tmpdir(), "clawql-vault-"));
    dirs.push(d);
    const f = join(d, "not-a-dir");
    await writeFile(f, "x", "utf8");
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = f;
    await expect(validateObsidianVaultAtStartup()).rejects.toThrow(/not a directory/);
  });
});

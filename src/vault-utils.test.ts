import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readVaultTextFile,
  resolveVaultPath,
  withVaultWriteLock,
  writeVaultTextFileAtomic,
} from "./vault-utils.js";

describe("vault-utils", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  async function freshVault(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), "clawql-vault-"));
    dirs.push(d);
    return d;
  }

  it("resolveVaultPath rejects path traversal", async () => {
    const root = await freshVault();
    expect(() => resolveVaultPath(root, "../etc/passwd")).toThrow(/Invalid vault relative path/);
  });

  it("writeVaultTextFileAtomic and readVaultTextFile round-trip", async () => {
    const root = await freshVault();
    await writeVaultTextFileAtomic(root, "notes/hello.md", "# hi\n");
    const text = await readVaultTextFile(root, "notes/hello.md");
    expect(text).toBe("# hi\n");
    const disk = await readFile(join(root, "notes", "hello.md"), "utf8");
    expect(disk).toBe("# hi\n");
  });

  it("withVaultWriteLock allows only one writer at a time", async () => {
    const root = await freshVault();
    let concurrent = 0;
    let max = 0;
    await Promise.all([
      withVaultWriteLock(root, async () => {
        concurrent++;
        max = Math.max(max, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent--;
      }),
      withVaultWriteLock(root, async () => {
        concurrent++;
        max = Math.max(max, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent--;
      }),
    ]);
    expect(max).toBe(1);
  });
});

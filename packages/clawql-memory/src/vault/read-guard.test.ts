import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSafeVaultMemoryRead,
  filterConfiguredFileRoots,
  isDeniedVaultSecretRel,
  isForbiddenFileRoot,
} from "./read-guard.js";

describe("vault read-guard (4.01 / 4.03)", () => {
  it("denies secret vault-relative paths", () => {
    expect(isDeniedVaultSecretRel("vault/providers.json")).toBe(true);
    expect(isDeniedVaultSecretRel("clawql.env")).toBe(true);
    expect(isDeniedVaultSecretRel("Auth/api-keys.json")).toBe(true);
    expect(isDeniedVaultSecretRel("Memory/note.md")).toBe(false);
  });

  it("allows Memory/*.md and refuses vault/providers.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-vault-rg-"));
    await mkdir(join(root, "Memory"), { recursive: true });
    await mkdir(join(root, "vault"), { recursive: true });
    await writeFile(join(root, "Memory", "note.md"), "# hi\n", "utf8");
    await writeFile(join(root, "vault", "providers.json"), '{"k":"v"}\n', "utf8");

    const ok = await assertSafeVaultMemoryRead(root, "Memory/note.md");
    expect(ok.relativePath).toBe("Memory/note.md");

    await expect(assertSafeVaultMemoryRead(root, "vault/providers.json")).rejects.toThrow(
      /secret|non-note|Memory/
    );
  });

  it("refuses symlink escape out of Memory/", async () => {
    const root = await mkdtemp(join(tmpdir(), "clawql-vault-sym-"));
    await mkdir(join(root, "Memory"), { recursive: true });
    await mkdir(join(root, "vault"), { recursive: true });
    await writeFile(join(root, "vault", "providers.json"), "secret\n", "utf8");
    await symlink(join(root, "vault", "providers.json"), join(root, "Memory", "leak.md"));

    await expect(assertSafeVaultMemoryRead(root, "Memory/leak.md")).rejects.toThrow(
      /symlink escape|secret/
    );
  });

  it("refuses /, home, and CLAWQL_HOME as file roots", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-fake-home-"));
    expect(isForbiddenFileRoot("/", {})).toBe(true);
    expect(isForbiddenFileRoot(home, { CLAWQL_HOME: home })).toBe(true);
    const okDir = await mkdtemp(join(tmpdir(), "clawql-ok-root-"));
    expect(isForbiddenFileRoot(okDir, { CLAWQL_HOME: home })).toBe(false);
    expect(filterConfiguredFileRoots(["/", home, okDir], { CLAWQL_HOME: home })).toEqual([okDir]);
  });
});

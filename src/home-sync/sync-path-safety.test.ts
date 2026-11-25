/**
 * Audit 2.07: pull must not write outside home or into secret paths.
 */

import { mkdtemp, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absPathForRel, assertSafeSyncRelPath, isExcludedRel } from "./collect.js";

describe("home-sync path safety (audit 2.07)", () => {
  it("rejects traversal and absolute paths", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-sync-safe-"));
    expect(() => assertSafeSyncRelPath(home, "../.bashrc")).toThrow(/Unsafe/);
    expect(() => assertSafeSyncRelPath(home, "/etc/passwd")).toThrow(/Unsafe/);
    expect(() => absPathForRel(home, "vault/providers.json")).toThrow(/Excluded/);
    expect(() => absPathForRel(home, "Auth/api-keys.json")).toThrow(/Excluded/);
    expect(() => absPathForRel(home, "worm/clawql-worm.sqlite")).toThrow(/Excluded/);
  });

  it("allows Memory notes under home", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-sync-ok-"));
    await mkdir(join(home, "Memory"), { recursive: true });
    const abs = absPathForRel(home, "Memory/note.md");
    expect(abs.startsWith(home)).toBe(true);
    await writeFile(abs, "ok");
    expect(await readFile(abs, "utf8")).toBe("ok");
  });

  it("marks secret prefixes excluded", () => {
    expect(isExcludedRel("vault/providers.json")).toBe(true);
    expect(isExcludedRel("Auth/api-keys.json")).toBe(true);
    expect(isExcludedRel("worm/x")).toBe(true);
    expect(isExcludedRel("clawql.env")).toBe(true);
    expect(isExcludedRel("sources.json")).toBe(true);
    expect(isExcludedRel("sources/custom/foo.json")).toBe(true);
    expect(isExcludedRel("Memory/hello.md")).toBe(false);
  });
});

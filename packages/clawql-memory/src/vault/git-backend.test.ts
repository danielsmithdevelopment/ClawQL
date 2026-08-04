import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitVaultAfterIngest, memoryGitBackendEnabled } from "./git-backend.js";

const execFileAsync = promisify(execFile);

describe("git-backend commit-on-ingest", () => {
  let home: string;
  const saved: Record<string, string | undefined> = {};

  function stash(keys: string[]) {
    for (const k of keys) saved[k] = process.env[k];
  }
  function restore() {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-git-vault-"));
    await mkdir(join(home, "Memory"), { recursive: true });
    stash([
      "CLAWQL_MEMORY_BACKEND",
      "CLAWQL_MEMORY_GIT_COMMIT_ON",
      "CLAWQL_MEMORY_GIT_PUSH_MODE",
      "CLAWQL_MEMORY_GIT_REMOTE",
      "CLAWQL_MEMORY_GIT_AUTHOR_NAME",
      "CLAWQL_MEMORY_GIT_AUTHOR_EMAIL",
    ]);
  });

  afterEach(async () => {
    restore();
    await rm(home, { recursive: true, force: true });
  });

  it("memoryGitBackendEnabled reads CLAWQL_MEMORY_BACKEND=git", () => {
    process.env.CLAWQL_MEMORY_BACKEND = "git";
    expect(memoryGitBackendEnabled()).toBe(true);
  });

  it("skips when git backend disabled", async () => {
    delete process.env.CLAWQL_MEMORY_BACKEND;
    delete process.env.CLAWQL_MEMORY_GIT_COMMIT_ON;
    const r = await commitVaultAfterIngest({ vault: home, title: "x" });
    expect(r.committed).toBe(false);
    expect(r.skipped).toMatch(/disabled/i);
  });

  it("inits repo and commits on ingest", async () => {
    process.env.CLAWQL_MEMORY_BACKEND = "git";
    process.env.CLAWQL_MEMORY_GIT_PUSH_MODE = "off";
    process.env.CLAWQL_MEMORY_GIT_AUTHOR_NAME = "Test Agent";
    process.env.CLAWQL_MEMORY_GIT_AUTHOR_EMAIL = "test@clawql.local";

    await writeFile(
      join(home, "Memory", "decision.md"),
      "# Decision\n\nJWT over sessions.\n",
      "utf8"
    );

    const r = await commitVaultAfterIngest({
      vault: home,
      path: "Memory/decision.md",
      title: "JWT over sessions",
      correlationId: "sess-1",
    });

    expect(r.committed).toBe(true);
    expect(r.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(r.error).toBeUndefined();

    const { stdout } = await execFileAsync("git", ["-C", home, "log", "-1", "--pretty=%s"]);
    expect(stdout.trim()).toContain("memory_ingest: JWT over sessions");
    expect(stdout.trim()).toContain("sess-1");
  });

  it("returns nothing-to-commit on second identical call", async () => {
    process.env.CLAWQL_MEMORY_BACKEND = "git";
    process.env.CLAWQL_MEMORY_GIT_PUSH_MODE = "off";
    await writeFile(join(home, "Memory", "a.md"), "a\n", "utf8");
    const first = await commitVaultAfterIngest({ vault: home, title: "a" });
    expect(first.committed).toBe(true);
    const second = await commitVaultAfterIngest({ vault: home, title: "a" });
    expect(second.committed).toBe(false);
    expect(second.skipped).toMatch(/nothing to commit/i);
  });
});

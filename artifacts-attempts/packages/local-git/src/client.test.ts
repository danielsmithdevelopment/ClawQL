import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalGitClient } from "./client.js";
import { sealEvidenceNote } from "@artifacts-attempts/notes";
import { fetchAndReadNote, writeEvidenceNote } from "./notes-store.js";
import { runGit } from "./git.js";

const roots: string[] = [];

afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "aa-local-"));
  roots.push(d);
  return d;
}

describe("local-git client (real git witnesses)", () => {
  it("seeds, forks, scopes tokens, and stores git notes", async () => {
    const root = tmp();
    const client = createLocalGitClient(root);
    const seedSrc = join(root, "seed-src");
    mkdirSync(seedSrc);
    writeFileSync(join(seedSrc, "README.md"), "# demo\n");

    client.seedFromDirectory("webhooks", seedSrc);
    await client.fork("webhooks", "tsk_a-att_1");
    const tok = await client.createToken("tsk_a-att_1", "write", 3600);
    const other = await client.createToken("webhooks", "write", 3600);

    const wt = join(root, "wt1");
    client.worktreeCheckout("tsk_a-att_1", wt);
    writeFileSync(join(wt, "README.md"), "# demo\nfixed\n");
    runGit(wt, ["add", "-A"]);
    runGit(wt, ["commit", "-m", "fix"]);
    const commit = client.pushWorktree("tsk_a-att_1", wt, tok.plaintext);

    expect(() => client.pushWorktree("tsk_a-att_1", wt, other.plaintext)).toThrow(/refused|not valid/);

    const note = sealEvidenceNote({
      schema: "artifacts-attempts.evidence/v1",
      taskId: "tsk_a",
      attemptId: "att_1",
      repo: "tsk_a-att_1",
      commit,
      evaluatedAt: new Date().toISOString(),
      agent: { client: "replay", model: "none" },
      tests: { passed: 1, failed: 0, command: "npm test" },
      policy: { clean: true, violations: [] },
      diff: { insertions: 1, deletions: 0 },
      prev: null,
    });
    writeEvidenceNote(client, "tsk_a-att_1", wt, commit, note, tok.plaintext);

    const fetched = fetchAndReadNote(client, "tsk_a-att_1", commit, join(root, "scratch"));
    expect(fetched?.hash).toBe(note.hash);
    expect(fetched?.commit).toBe(commit);
  });
});

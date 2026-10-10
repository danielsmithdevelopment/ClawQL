import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseEvidenceNote,
  type EvidenceNote,
  verifyEvidenceNote,
} from "@artifacts-attempts/notes";
import { ensureDir, runGit } from "./git.js";
import type { LocalGitClient } from "./client.js";

/** Attach an evidence note to a commit via real `git notes`, then push refs/notes. */
export function writeEvidenceNote(
  client: LocalGitClient,
  repo: string,
  worktree: string,
  commit: string,
  note: EvidenceNote,
  writeToken: string
): void {
  const check = verifyEvidenceNote(note);
  if (!check.ok) throw new Error(check.reason);
  const payload = JSON.stringify(note);
  // git notes add -f -m … <commit>
  runGit(worktree, ["notes", "add", "-f", "-m", payload, commit]);
  client.authorize(repo, writeToken, "write");
  runGit(worktree, ["push", "origin", "refs/notes/commits"]);
}

export function readEvidenceNote(worktree: string, commit: string): EvidenceNote | null {
  try {
    const raw = runGit(worktree, ["notes", "show", commit]);
    return parseEvidenceNote(raw);
  } catch {
    return null;
  }
}

/** Fetch notes into a fresh clone and read — witness that notes survive push. */
export function fetchAndReadNote(client: LocalGitClient, repo: string, commit: string, scratchDir: string): EvidenceNote | null {
  ensureDir(scratchDir);
  const dest = join(scratchDir, `read-${repo}`);
  if (existsSync(dest)) {
    runGit(dest, ["fetch", "origin", "refs/notes/commits:refs/notes/commits"]);
    runGit(dest, ["fetch", "origin"]);
  } else {
    runGit(client.root, ["clone", client.barePath(repo), dest]);
    try {
      runGit(dest, ["fetch", "origin", "refs/notes/commits:refs/notes/commits"]);
    } catch {
      return null;
    }
  }
  return readEvidenceNote(dest, commit);
}

export function writeNotesJsonl(path: string, notes: readonly EvidenceNote[]): void {
  writeFileSync(path, notes.map((n) => JSON.stringify(n)).join("\n") + "\n");
}

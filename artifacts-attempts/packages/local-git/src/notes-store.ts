import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseEvidenceNote,
  type EvidenceNote,
  verifyEvidenceNote,
} from "@artifacts-attempts/notes";
import { assertPathUnderRoot, assertSafeName, ensureDir, gitClone, runGit } from "./git.js";
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
  if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
    throw new Error(`unsafe commit: ${commit}`);
  }
  const check = verifyEvidenceNote(note);
  if (!check.ok) throw new Error(check.reason);
  const payload = JSON.stringify(note);
  const absWt = assertPathUnderRoot(client.root, worktree);
  runGit(absWt, ["notes", "add", "-f", "-m", payload, commit]);
  client.authorize(assertSafeName(repo, "repo"), writeToken, "write");
  runGit(absWt, ["push", "origin", "refs/notes/commits"]);
}

export function readEvidenceNote(worktree: string, commit: string): EvidenceNote | null {
  if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
    throw new Error(`unsafe commit: ${commit}`);
  }
  try {
    const raw = runGit(worktree, ["notes", "show", commit]);
    return parseEvidenceNote(raw);
  } catch {
    return null;
  }
}

/** Fetch notes into a fresh clone and read — witness that notes survive push. */
export function fetchAndReadNote(
  client: LocalGitClient,
  repo: string,
  commit: string,
  scratchDir: string
): EvidenceNote | null {
  const safeRepo = assertSafeName(repo, "repo");
  const absScratch = assertPathUnderRoot(client.root, scratchDir);
  ensureDir(absScratch);
  const dest = assertPathUnderRoot(client.root, join(absScratch, `read-${safeRepo}`));
  if (existsSync(dest)) {
    runGit(dest, ["fetch", "origin", "refs/notes/commits:refs/notes/commits"]);
    runGit(dest, ["fetch", "origin"]);
  } else {
    gitClone(client.root, client.barePath(safeRepo), dest);
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

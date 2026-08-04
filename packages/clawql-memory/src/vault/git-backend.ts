/**
 * Git-native vault backend (Mode A) — commit-on-ingest + optional async push.
 *
 * Env:
 * - CLAWQL_MEMORY_BACKEND=git — enable git commits after successful ingest
 * - CLAWQL_MEMORY_GIT_COMMIT_ON=ingest|off — default ingest when backend=git
 * - CLAWQL_MEMORY_GIT_REMOTE — remote URL/name (default: origin if configured)
 * - CLAWQL_MEMORY_GIT_PUSH_MODE=async|sync|off — default async when remote set
 * - CLAWQL_MEMORY_GIT_AUTHOR_NAME / CLAWQL_MEMORY_GIT_AUTHOR_EMAIL — commit identity
 *
 * Uses system `git` (no isomorphic-git dependency). Vault working tree = Obsidian path.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export type GitCommitOnIngestResult = {
  committed: boolean;
  commitSha?: string;
  skipped?: string;
  pushed?: boolean;
  pushError?: string;
  error?: string;
};

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** True when vault writes should create git commits. */
export function memoryGitBackendEnabled(): boolean {
  const backend = envTrim("CLAWQL_MEMORY_BACKEND")?.toLowerCase();
  if (backend === "git") return true;
  const commitOn = envTrim("CLAWQL_MEMORY_GIT_COMMIT_ON")?.toLowerCase();
  return commitOn === "ingest" || commitOn === "1" || commitOn === "true";
}

function gitCommitOnIngest(): boolean {
  if (!memoryGitBackendEnabled()) return false;
  const commitOn = envTrim("CLAWQL_MEMORY_GIT_COMMIT_ON")?.toLowerCase();
  if (commitOn === "off" || commitOn === "0" || commitOn === "false" || commitOn === "none") {
    return false;
  }
  return true;
}

function pushMode(): "async" | "sync" | "off" {
  const m = envTrim("CLAWQL_MEMORY_GIT_PUSH_MODE")?.toLowerCase();
  if (m === "sync" || m === "async" || m === "off") return m;
  // Default: async push when a remote is configured; else off.
  return envTrim("CLAWQL_MEMORY_GIT_REMOTE") ? "async" : "off";
}

async function git(
  vault: string,
  args: string[],
  opts?: { env?: NodeJS.ProcessEnv }
): Promise<{ stdout: string; stderr: string }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts?.env,
    GIT_TERMINAL_PROMPT: "0",
  };
  const { stdout, stderr } = await execFileAsync("git", ["-C", vault, ...args], {
    env,
    maxBuffer: 4 * 1024 * 1024,
  });
  return { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
}

async function isGitRepo(vault: string): Promise<boolean> {
  try {
    await access(join(vault, ".git"));
    const { stdout } = await git(vault, ["rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function ensureGitRepo(vault: string): Promise<void> {
  if (await isGitRepo(vault)) return;
  await git(vault, ["init"]);
  // Quiet local identity for agent commits when unset.
  const name = envTrim("CLAWQL_MEMORY_GIT_AUTHOR_NAME") ?? "ClawQL Memory";
  const email = envTrim("CLAWQL_MEMORY_GIT_AUTHOR_EMAIL") ?? "memory@clawql.local";
  await git(vault, ["config", "user.name", name]);
  await git(vault, ["config", "user.email", email]);
  const remote = envTrim("CLAWQL_MEMORY_GIT_REMOTE");
  if (remote) {
    try {
      await git(vault, ["remote", "get-url", "origin"]);
    } catch {
      await git(vault, ["remote", "add", "origin", remote]);
    }
  }
}

function authorEnv(): NodeJS.ProcessEnv {
  const name = envTrim("CLAWQL_MEMORY_GIT_AUTHOR_NAME") ?? "ClawQL Memory";
  const email = envTrim("CLAWQL_MEMORY_GIT_AUTHOR_EMAIL") ?? "memory@clawql.local";
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
  };
}

async function pushVault(vault: string): Promise<{ ok: boolean; error?: string }> {
  const remote = envTrim("CLAWQL_MEMORY_GIT_REMOTE") ?? "origin";
  try {
    // Prefer configured upstream; fall back to origin HEAD branch.
    let branch = "main";
    try {
      const { stdout } = await git(vault, ["rev-parse", "--abbrev-ref", "HEAD"]);
      branch = stdout.trim() || "main";
    } catch {
      /* keep main */
    }
    await git(vault, ["push", "-u", remote, branch]);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * After a successful memory_ingest vault write: stage + commit (and optionally push).
 */
export async function commitVaultAfterIngest(input: {
  vault: string;
  path?: string;
  title?: string;
  correlationId?: string;
}): Promise<GitCommitOnIngestResult> {
  if (!gitCommitOnIngest()) {
    return { committed: false, skipped: "git commit-on-ingest disabled" };
  }

  try {
    await ensureGitRepo(input.vault);

    // Stage all vault changes (index.md / log.md / note) — not only the note path.
    await git(input.vault, ["add", "-A"]);

    const { stdout: status } = await git(input.vault, ["status", "--porcelain"]);
    if (!status.trim()) {
      return { committed: false, skipped: "nothing to commit" };
    }

    const title = (input.title ?? input.path ?? "memory ingest").replace(/"/g, "'");
    const corr = input.correlationId?.trim() ? ` (${input.correlationId.trim()})` : "";
    const msg = `memory_ingest: ${title}${corr}`;

    await git(input.vault, ["commit", "-m", msg], { env: authorEnv() });
    const { stdout: shaOut } = await git(input.vault, ["rev-parse", "HEAD"]);
    const commitSha = shaOut.trim();

    const mode = pushMode();
    if (mode === "off") {
      return { committed: true, commitSha };
    }

    if (mode === "sync") {
      const push = await pushVault(input.vault);
      return {
        committed: true,
        commitSha,
        pushed: push.ok,
        pushError: push.error,
      };
    }

    // async — fire and forget; do not block ingest.
    void pushVault(input.vault).then((push) => {
      if (!push.ok) {
        console.error(`[clawql-mcp] memory git async push failed: ${push.error}`);
      }
    });
    return { committed: true, commitSha, pushed: undefined };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] memory git commit-on-ingest failed: ${msg}`);
    return { committed: false, error: msg };
  }
}

import { spawnSync } from "node:child_process";

export type GitHeadInfo = {
  commit: string;
  dirty: boolean;
  remoteUrl?: string;
};

export function readGitHead(rootDir: string): GitHeadInfo {
  const commit = runGit(rootDir, ["rev-parse", "HEAD"]);
  const status = runGit(rootDir, ["status", "--porcelain"], { allowFailure: true });
  const remoteUrl = runGit(rootDir, ["config", "--get", "remote.origin.url"], {
    allowFailure: true,
  });
  // Local Layer 0 tooling / untracked outputs must not fail the release dirty check.
  // Only modified tracked files (and non-tooling paths) count as dirty.
  const dirtyLines = status
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .filter((l) => !/^\?\?/.test(l.trim()))
    .filter((l) => !l.includes(".clawql/"))
    .filter((l) => !l.includes(".rifts/"));
  return {
    commit: commit.trim(),
    dirty: dirtyLines.length > 0,
    remoteUrl: remoteUrl.trim() || undefined,
  };
}

function runGit(cwd: string, args: string[], opts: { allowFailure?: boolean } = {}): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0 && !opts.allowFailure) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
  return (r.stdout ?? "").trim();
}

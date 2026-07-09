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
  return {
    commit: commit.trim(),
    dirty: status.trim().length > 0,
    remoteUrl: remoteUrl.trim() || undefined,
  };
}

function runGit(
  cwd: string,
  args: string[],
  opts: { allowFailure?: boolean } = {}
): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0 && !opts.allowFailure) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
  return (r.stdout ?? "").trim();
}

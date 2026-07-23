import { spawnSync } from "node:child_process";

export type RunResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; allowFailure?: boolean } = {}
): RunResult {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    encoding: "utf8",
  });
  const status = r.status ?? 1;
  const stdout = (r.stdout ?? "").trim();
  const stderr = (r.stderr ?? "").trim();
  if (status !== 0 && !opts.allowFailure) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${stderr || stdout || `exit ${status}`}`);
  }
  return { status, stdout, stderr };
}

export function commandExists(cmd: string): boolean {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0;
}

export function isDryRun(explicit?: boolean): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  const mode = process.env.CLAWQL_RELEASE_MODE?.trim().toLowerCase();
  if (mode === "local" || mode === "dry-run" || mode === "dryrun") return true;
  if (process.env.CLAWQL_RELEASE_DRY_RUN === "1") return true;
  return false;
}

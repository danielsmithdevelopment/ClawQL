import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

export function runGit(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function initBare(path: string): void {
  if (existsSync(path)) return;
  ensureDir(path);
  runGit(path, ["init", "--bare", "-b", "main"]);
}

export function clone(url: string, dest: string): void {
  ensureDir(dest);
  runGit(process.cwd(), ["clone", url, dest]);
}

export function headCommit(cwd: string): string {
  return runGit(cwd, ["rev-parse", "HEAD"]);
}

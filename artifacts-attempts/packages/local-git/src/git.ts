import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";

/** Repo / attempt names only — blocks option-injection via `--upload-pack=…`. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function assertSafeName(name: string, label = "name"): string {
  if (!SAFE_NAME.test(name)) {
    throw new Error(`unsafe ${label}: ${name}`);
  }
  if (name.includes("..")) {
    throw new Error(`unsafe ${label}: ${name}`);
  }
  return name;
}

/** Absolute path under root; never starts with `-` (git option injection). */
export function assertPathUnderRoot(root: string, candidate: string): string {
  const absRoot = resolve(root);
  const abs = resolve(candidate);
  if (abs.startsWith("-") || normalize(abs).startsWith("-")) {
    throw new Error(`unsafe path starts with -: ${candidate}`);
  }
  const prefix = absRoot.endsWith(sep) ? absRoot : absRoot + sep;
  if (abs !== absRoot && !abs.startsWith(prefix)) {
    throw new Error(`path escapes root: ${candidate}`);
  }
  return abs;
}

export function runGit(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  if (!isAbsolute(cwd) && cwd !== process.cwd()) {
    // allow relative cwd from callers that already validated; still reject dash
  }
  if (cwd.startsWith("-")) {
    throw new Error(`unsafe git cwd: ${cwd}`);
  }
  for (const a of args) {
    if (a.includes("\0")) throw new Error("nul in git args");
  }
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Clone with path operands after `--` so they cannot be parsed as options. */
export function gitClone(
  cwd: string,
  source: string,
  dest: string,
  opts: { mirror?: boolean } = {}
): void {
  if (source.startsWith("-") || dest.startsWith("-")) {
    throw new Error("clone paths must not start with -");
  }
  const args = ["clone"];
  if (opts.mirror) args.push("--mirror");
  args.push("--", source, dest);
  runGit(cwd, args);
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
  gitClone(process.cwd(), url, dest);
}

export function headCommit(cwd: string): string {
  return runGit(cwd, ["rev-parse", "HEAD"]);
}

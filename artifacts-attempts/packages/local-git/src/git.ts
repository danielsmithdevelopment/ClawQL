import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { normalize, resolve, sep } from "node:path";

/** Repo / attempt names only — blocks option-injection via `--upload-pack=…`. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Must never appear in argv (CodeQL second-order / upload-pack injection). */
const FORBIDDEN_ARG = /^(--upload-pack|--receive-pack|--exec)(=|$)/i;

export function assertSafeName(name: string, label = "name"): string {
  if (!SAFE_NAME.test(name) || name.includes("..")) {
    throw new Error(`unsafe ${label}: ${name}`);
  }
  return name;
}

/** Absolute path under root; never starts with `-`. */
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

/**
 * Validate and return a fresh argv copy. Rejects --upload-pack and unknown
 * subcommands so CodeQL's second-order command injection cannot reach exec.
 */
export function sanitizeGitArgs(args: readonly string[]): string[] {
  if (args.length === 0) throw new Error("empty git args");
  const out: string[] = [];
  for (const raw of args) {
    if (typeof raw !== "string" || raw.includes("\0")) {
      throw new Error("invalid git arg");
    }
    if (FORBIDDEN_ARG.test(raw)) {
      throw new Error(`forbidden git arg: ${raw}`);
    }
    out.push(raw);
  }
  const sub = out[0]!;
  const allowedSubs = new Set([
    "init",
    "clone",
    "config",
    "add",
    "commit",
    "remote",
    "push",
    "fetch",
    "checkout",
    "reset",
    "notes",
    "rev-parse",
    "apply",
    "diff",
    "rebase",
  ]);
  if (!allowedSubs.has(sub)) {
    throw new Error(`git subcommand not allowlisted: ${sub}`);
  }
  // Any arg that looks like --upload-pack must already have been rejected;
  // also reject unknown long options that take an executable path.
  for (const a of out) {
    if (/^--[A-Za-z0-9-]+=/.test(a) && FORBIDDEN_ARG.test(a.split("=")[0]! + "=")) {
      throw new Error(`forbidden git arg: ${a}`);
    }
  }
  return out;
}

export function runGit(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): string {
  if (cwd.startsWith("-")) {
    throw new Error(`unsafe git cwd: ${cwd}`);
  }
  const safeArgs = sanitizeGitArgs(args);
  // safeArgs is a new array produced only after FORBIDDEN_ARG checks.
  return execFileSync("git", safeArgs, {
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

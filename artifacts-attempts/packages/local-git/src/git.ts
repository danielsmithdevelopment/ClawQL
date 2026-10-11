import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { normalize, resolve, sep } from "node:path";

/** Repo / attempt names only. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * CodeQL DoubleDashSanitizer pattern: reject args that start with `--`
 * so they cannot become `--upload-pack=…` for git/hg.
 */
export function rejectLeadingDoubleDash(arg: string, label = "arg"): string {
  if (arg.startsWith("--")) {
    throw new Error(`unsafe ${label} starts with --: ${arg}`);
  }
  if (arg.includes("\0")) {
    throw new Error(`nul in ${label}`);
  }
  return arg;
}

export function assertSafeName(name: string, label = "name"): string {
  // DoubleDashSanitizer-compatible guard (before regex).
  rejectLeadingDoubleDash(name, label);
  if (name.startsWith("-")) {
    throw new Error(`unsafe ${label}: ${name}`);
  }
  if (!SAFE_NAME.test(name) || name.includes("..")) {
    throw new Error(`unsafe ${label}: ${name}`);
  }
  return name;
}

/** Absolute path under root; never starts with `-` or `--`. */
export function assertPathUnderRoot(root: string, candidate: string): string {
  rejectLeadingDoubleDash(candidate, "path");
  const absRoot = resolve(root);
  const abs = resolve(candidate);
  rejectLeadingDoubleDash(abs, "path");
  if (abs.startsWith("-") || normalize(abs).startsWith("-")) {
    throw new Error(`unsafe path starts with -: ${candidate}`);
  }
  const prefix = absRoot.endsWith(sep) ? absRoot : absRoot + sep;
  if (abs !== absRoot && !abs.startsWith(prefix)) {
    throw new Error(`path escapes root: ${candidate}`);
  }
  return abs;
}

/** Fixed options we emit ourselves — never from user input. */
const STATIC_OPTIONS = new Set([
  "--bare",
  "--mirror",
  "--hard",
  "--shortstat",
  "-b",
  "-m",
  "-f",
  "-A",
  "-u",
]);

/**
 * Build argv for execFile. User-influenced operands are passed through
 * {@link rejectLeadingDoubleDash}. Static options are only those we hardcode.
 */
export function sanitizeGitArgs(args: readonly string[]): string[] {
  if (args.length === 0) throw new Error("empty git args");
  const out: string[] = [];
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
  const sub = args[0]!;
  if (!allowedSubs.has(sub)) {
    throw new Error(`git subcommand not allowlisted: ${sub}`);
  }
  out.push(sub);

  for (let i = 1; i < args.length; i++) {
    const raw = args[i]!;
    if (raw === "--") {
      out.push("--");
      // Everything after `--` is an operand — must not start with `--`.
      for (let j = i + 1; j < args.length; j++) {
        out.push(rejectLeadingDoubleDash(args[j]!, "git operand"));
      }
      return out;
    }
    if (STATIC_OPTIONS.has(raw)) {
      out.push(raw);
      continue;
    }
    // Operand or option-value (e.g. branch after -b, message after -m).
    out.push(rejectLeadingDoubleDash(raw, "git arg"));
  }
  return out;
}

export function runGit(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): string {
  rejectLeadingDoubleDash(cwd, "cwd");
  if (cwd.startsWith("-")) {
    throw new Error(`unsafe git cwd: ${cwd}`);
  }
  const safeArgs = sanitizeGitArgs(args);
  return execFileSync("git", safeArgs, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Clone with path operands after `--`. */
export function gitClone(
  cwd: string,
  source: string,
  dest: string,
  opts: { mirror?: boolean } = {}
): void {
  const src = rejectLeadingDoubleDash(source, "clone source");
  const dst = rejectLeadingDoubleDash(dest, "clone dest");
  if (src.startsWith("-") || dst.startsWith("-")) {
    throw new Error("clone paths must not start with -");
  }
  const args = ["clone"];
  if (opts.mirror) args.push("--mirror");
  args.push("--", src, dst);
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

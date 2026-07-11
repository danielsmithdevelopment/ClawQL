import { homedir } from "node:os";
import { resolve } from "node:path";

/** Expand leading `~` or `~/` to the user home directory. */
export function expandTilde(input: string, home = homedir()): string {
  const trimmed = input.trim();
  if (trimmed === "~") return home;
  if (trimmed.startsWith("~/")) return resolve(home, trimmed.slice(2));
  return trimmed;
}

/** Resolve to an absolute path for Seatbelt `(subpath "...")` rules. */
export function resolveSandboxPath(input: string, home = homedir()): string {
  return resolve(expandTilde(input, home));
}

/** Escape a path for embedding inside a Seatbelt profile string literal. */
export function seatbeltSubpathLiteral(absPath: string): string {
  return absPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

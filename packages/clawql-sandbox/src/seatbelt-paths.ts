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
  // Reject / neutralize control chars that would break SBPL `"..."` string literals.
  return absPath
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\0/g, "");
}

/**
 * Escape a path for embedding inside a POSIX shell double-quoted string
 * (Seatbelt probe scripts). Distinct from {@link seatbeltSubpathLiteral}.
 */
export function shellDoubleQuotedLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

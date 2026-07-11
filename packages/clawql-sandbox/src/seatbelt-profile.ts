import { tmpdir } from "node:os";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SandboxContainmentConfig } from "./seatbelt-config.js";
import { resolvedAllowedPaths, resolvedDeniedPaths } from "./seatbelt-config.js";
import { seatbeltSubpathLiteral } from "./seatbelt-paths.js";

/** Minimal exec profile when no containment config exists (network denied). */
export const SEATBELT_EXEC_PROFILE_V1 = `(version 1)
(allow default)
(deny network*)
`;

const SYSTEM_READ_SUBPATHS = [
  "/usr",
  "/bin",
  "/sbin",
  "/System",
  "/Library",
  "/private/tmp",
  "/tmp",
  "/dev",
  "/var/run",
] as const;

function subpathRules(kind: "file-read*" | "file-write*", paths: string[]): string[] {
  return paths.map((p) => `(allow ${kind} (subpath "${seatbeltSubpathLiteral(p)}"))`);
}

/**
 * Agent / harness profile — deny-by-default filesystem; explicit allow list only.
 * Prevents subagent `rm -rf $HOME` class incidents outside allowed repo roots.
 */
export function buildAgentSeatbeltProfile(
  config: SandboxContainmentConfig,
  home = homedir()
): string {
  const allowed = resolvedAllowedPaths(config, home);
  const denied = resolvedDeniedPaths(config, home);
  const tmp = join(tmpdir());

  const lines: string[] = [
    "(version 1)",
    "(deny default)",
    "",
    "; --- read: allowed project roots + ClawQL home ---",
    ...subpathRules("file-read*", allowed),
    "",
    "; --- read: system/runtime (shell, node, git) ---",
    ...SYSTEM_READ_SUBPATHS.map(
      (p) => `(allow file-read* (subpath "${seatbeltSubpathLiteral(p)}"))`
    ),
    "",
    "; --- write: allowed roots + temp ---",
    ...subpathRules("file-write*", allowed),
    `(allow file-write* (subpath "${seatbeltSubpathLiteral(tmp)}"))`,
    `(allow file-write* (subpath "${seatbeltSubpathLiteral("/private/tmp")}"))`,
    `(allow file-write* (subpath "${seatbeltSubpathLiteral("/tmp")}"))`,
    "",
    "; --- deny sensitive paths even if broad allows exist ---",
    ...denied.map(
      (p) => `(deny file-read* (subpath "${seatbeltSubpathLiteral(p)}"))`
    ),
    ...denied.map(
      (p) => `(deny file-write* (subpath "${seatbeltSubpathLiteral(p)}"))`
    ),
    "",
    "; --- no outbound network for local agent containment ---",
    "(deny network*)",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * sandbox_exec profile — workspace writes + allowed reads for tooling; network denied.
 */
export function buildExecSeatbeltProfile(
  config: SandboxContainmentConfig,
  workspaceRoot: string,
  home = homedir()
): string {
  const allowed = resolvedAllowedPaths(config, home);
  const denied = resolvedDeniedPaths(config, home);

  const lines: string[] = [
    "(version 1)",
    "(deny default)",
    "",
    "; --- sandbox_exec workspace ---",
    `(allow file-read* (subpath "${seatbeltSubpathLiteral(workspaceRoot)}"))`,
    `(allow file-write* (subpath "${seatbeltSubpathLiteral(workspaceRoot)}"))`,
    "",
    "; --- read project + system deps ---",
    ...subpathRules("file-read*", allowed),
    ...SYSTEM_READ_SUBPATHS.map(
      (p) => `(allow file-read* (subpath "${seatbeltSubpathLiteral(p)}"))`
    ),
    "",
    "; --- deny sensitive paths ---",
    ...denied.map(
      (p) => `(deny file-read* (subpath "${seatbeltSubpathLiteral(p)}"))`
    ),
    ...denied.map(
      (p) => `(deny file-write* (subpath "${seatbeltSubpathLiteral(p)}"))`
    ),
    "",
    "(deny network*)",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Record which lab celld binary a soak/board measured.
 * Labels are advisory; celldLabGitCommit + celldSha256 are authoritative.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {{
 *   repoRoot: string,
 *   celldBin?: string | null,
 *   buildEnv?: string | null,
 *   gitCommitEnv?: string | null,
 *   defaultLabBuild?: string,
 * }} opts
 */
export function resolveCelldIdentity(opts) {
  const {
    repoRoot,
    celldBin = null,
    buildEnv = null,
    gitCommitEnv = null,
    defaultLabBuild = "lab_expiry_not_dead_fixed",
  } = opts;

  const resolvedBin =
    (typeof celldBin === "string" && celldBin.trim()) ||
    process.env.CELLD_BIN?.trim() ||
    which("celld");
  const labBin =
    typeof resolvedBin === "string" && /vendor\/celld-lab\//.test(resolvedBin);

  const envBuild = (buildEnv ?? process.env.FLEET_SOAK_CELLD_BUILD)?.trim();
  const celldBuild = envBuild || (labBin ? defaultLabBuild : "stock_or_unknown");

  let celldLabGitCommit =
    (gitCommitEnv ?? process.env.FLEET_SOAK_CELLD_GIT_COMMIT)?.trim() ||
    process.env.FLEET_PHASED_CELLD_GIT_COMMIT?.trim() ||
    null;
  if (!celldLabGitCommit) {
    try {
      celldLabGitCommit = execFileSync(
        "git",
        ["-C", join(repoRoot, "vendor/celld-lab"), "rev-parse", "HEAD"],
        { encoding: "utf8" }
      ).trim();
    } catch {
      try {
        celldLabGitCommit = execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
          cwd: repoRoot,
        }).trim();
      } catch {
        celldLabGitCommit = null;
      }
    }
  }

  let celldSha256 = null;
  if (resolvedBin && existsSync(resolvedBin)) {
    try {
      celldSha256 = createHash("sha256")
        .update(readFileSync(resolvedBin))
        .digest("hex");
    } catch {
      celldSha256 = null;
    }
  }

  return {
    celldBin: resolvedBin || null,
    celldBuild,
    celldLabGitCommit,
    celldSha256,
    labBin,
  };
}

function which(cmd) {
  try {
    return execFileSync("which", [cmd], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

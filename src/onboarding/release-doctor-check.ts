/**
 * Release manifest check for `clawql doctor --smoke`.
 */

import { getPackageRoot } from "clawql-api";
import { checkReleaseManifest, type ReleaseManifestCheckResult } from "clawql-release";
import { NPM_PACKAGE_VERSION } from "../npm-version.js";
import type { DoctorCheck } from "./doctor.js";

function packageRootOrCwd(): string {
  try {
    return getPackageRoot();
  } catch {
    return process.cwd();
  }
}

export async function runReleaseDoctorCheck(): Promise<DoctorCheck> {
  const explicit = process.env.CLAWQL_RELEASE_MANIFEST?.trim();
  const result: ReleaseManifestCheckResult = await checkReleaseManifest({
    explicitPath: explicit,
    version: NPM_PACKAGE_VERSION,
    rootDir: packageRootOrCwd(),
    requirePresent: Boolean(explicit),
    strict: Boolean(explicit),
  });

  const level =
    result.status === "ok"
      ? "ok"
      : result.status === "fail"
        ? "fail"
        : result.status === "skip"
          ? "ok"
          : "warn";

  return {
    level,
    message: `release manifest: ${result.message}`,
    detail: result.detail,
  };
}

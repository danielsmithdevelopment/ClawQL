/**
 * Layer 0 — optional release manifest verification at MCP startup.
 */

import { getPackageRoot } from "clawql-api";
import { enforceReleaseManifestAtStartup } from "clawql-release";
import { NPM_PACKAGE_VERSION } from "./npm-version.js";

function packageRootOrCwd(): string {
  try {
    return getPackageRoot();
  } catch {
    return process.cwd();
  }
}

/** No-op unless `CLAWQL_RELEASE_MANIFEST` is set. */
export async function maybeVerifyReleaseManifestAtStartup(): Promise<void> {
  await enforceReleaseManifestAtStartup({
    version: NPM_PACKAGE_VERSION,
    rootDir: packageRootOrCwd(),
  });
}

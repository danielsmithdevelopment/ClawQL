/**
 * Layer 0 — optional release manifest verification at MCP startup.
 */

import { getPackageRoot } from "clawql-api";
import { enforceReleaseManifestAtStartupEffect } from "clawql-release";
import { Effect } from "effect";
import { NPM_PACKAGE_VERSION } from "./npm-version.js";

function packageRootOrCwd(): string {
  try {
    return getPackageRoot();
  } catch {
    return process.cwd();
  }
}

/** No-op unless `CLAWQL_RELEASE_MANIFEST` is set. Prefer {@link maybeVerifyReleaseManifestAtStartupEffect}. */
export function maybeVerifyReleaseManifestAtStartupEffect(): Effect.Effect<void, Error> {
  return enforceReleaseManifestAtStartupEffect({
    version: NPM_PACKAGE_VERSION,
    rootDir: packageRootOrCwd(),
  });
}

/** Promise façade for MCP/HTTP process start. */
export async function maybeVerifyReleaseManifestAtStartup(): Promise<void> {
  return Effect.runPromise(maybeVerifyReleaseManifestAtStartupEffect());
}

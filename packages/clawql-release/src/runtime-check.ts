import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { readReleaseConfig } from "./config.js";
import { releaseBundleDir } from "./manifest.js";
import { verifyReleaseManifest } from "./verify.js";

export type ReleaseManifestCheckStatus = "ok" | "warn" | "fail" | "skip";

export type ReleaseManifestCheckResult = {
  status: ReleaseManifestCheckStatus;
  message: string;
  detail?: string;
  manifestPath?: string;
};

export type CheckReleaseManifestOptions = {
  /** `CLAWQL_RELEASE_MANIFEST` or explicit override */
  explicitPath?: string;
  /** Running package version (e.g. `7.0.0`) */
  version?: string;
  /** Repo/package root for `releases/vX.Y.Z` lookup */
  rootDir?: string;
  /**
   * When true, a missing manifest is a failure (startup with `CLAWQL_RELEASE_MANIFEST`).
   * When false, missing manifest is a warn (`clawql doctor --smoke` auto-resolve).
   */
  requirePresent?: boolean;
  /** When true, verification failure maps to `fail` instead of `warn` */
  strict?: boolean;
};

export function resolveReleaseManifestPathSync(
  options: Pick<CheckReleaseManifestOptions, "explicitPath" | "version" | "rootDir"> & {
    outputDir?: string;
  }
): string | null {
  const explicit = options.explicitPath?.trim();
  if (explicit) return resolve(explicit);

  const version = options.version?.trim();
  const root = options.rootDir ?? process.cwd();
  if (!version) return null;

  const outputDir = options.outputDir ?? "releases";
  const tag = version.startsWith("v") ? version : `v${version}`;
  const candidates = [
    join(releaseBundleDir(root, tag, outputDir), "manifest.json"),
    join(root, outputDir, version, "manifest.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function expectedBundlePath(
  rootDir: string,
  version: string | undefined,
  outputDir: string
): string | undefined {
  if (!version?.trim()) return undefined;
  const tag = version.startsWith("v") ? version : `v${version}`;
  return join(releaseBundleDir(rootDir, tag, outputDir), "manifest.json");
}

export async function checkReleaseManifest(
  options: CheckReleaseManifestOptions
): Promise<ReleaseManifestCheckResult> {
  const rootDir = options.rootDir ?? process.cwd();
  let outputDir = "releases";
  try {
    const cfg = await readReleaseConfig(rootDir);
    outputDir = cfg.outputDir;
  } catch {
    // default outputDir
  }

  const manifestPath = resolveReleaseManifestPathSync({
    explicitPath: options.explicitPath,
    version: options.version,
    rootDir,
    outputDir,
  });

  if (!manifestPath) {
    const expected = expectedBundlePath(rootDir, options.version, outputDir);
    if (options.requirePresent) {
      return {
        status: "fail",
        message: "Release manifest not found",
        detail: options.explicitPath
          ? `CLAWQL_RELEASE_MANIFEST=${options.explicitPath}`
          : expected
            ? `Expected ${expected}`
            : "Set CLAWQL_RELEASE_MANIFEST or run clawql release publish",
      };
    }
    return {
      status: "warn",
      message: "Release manifest not found (skipped)",
      detail: expected
        ? `No bundle at ${expected} — run clawql release publish after tagging`
        : "Set CLAWQL_RELEASE_MANIFEST to verify Layer 0 provenance",
    };
  }

  const bundleDir = join(manifestPath, "..");
  const result = await verifyReleaseManifest(manifestPath, bundleDir);

  if (!result.ok) {
    return {
      status: options.strict ? "fail" : "warn",
      message: "Release manifest verification failed",
      detail: result.errors.join("; "),
      manifestPath,
    };
  }

  if (options.version && result.manifest.version !== options.version) {
    return {
      status: "warn",
      message: `Release manifest verified with version mismatch (manifest ${result.manifest.version} ≠ running ${options.version})`,
      detail: `${manifestPath} merkleRoot=${result.manifest.merkleRoot}`,
      manifestPath,
    };
  }

  return {
    status: "ok",
    message: `Release manifest verified: ${result.manifest.tag}`,
    detail: `${manifestPath} merkleRoot=${result.manifest.merkleRoot}`,
    manifestPath,
  };
}

/** True when verification failures should abort MCP startup. */
export function isReleaseManifestStrict(): boolean {
  const raw = process.env.CLAWQL_RELEASE_MANIFEST_STRICT?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * When `CLAWQL_RELEASE_MANIFEST` is set, verify before MCP serves traffic.
 * Fails closed in production (`NODE_ENV=production`) or when `CLAWQL_RELEASE_MANIFEST_STRICT=1`.
 */
export async function enforceReleaseManifestAtStartup(options: {
  explicitPath?: string;
  version?: string;
  rootDir?: string;
}): Promise<void> {
  const explicit = options.explicitPath ?? process.env.CLAWQL_RELEASE_MANIFEST?.trim();
  if (!explicit) return;

  const strict = isReleaseManifestStrict();
  const check = await checkReleaseManifest({
    explicitPath: explicit,
    version: options.version,
    rootDir: options.rootDir,
    requirePresent: true,
    strict,
  });

  if (check.status === "ok") {
    console.error(`[clawql-mcp] ${check.message}`);
    if (check.detail) console.error(`[clawql-mcp]   ${check.detail}`);
    return;
  }

  const prefix =
    check.status === "fail" ? "Release manifest check failed" : "Release manifest warning";
  console.error(`[clawql-mcp] ${prefix}: ${check.message}`);
  if (check.detail) console.error(`[clawql-mcp]   ${check.detail}`);

  if (check.status === "fail") {
    throw new Error(check.message);
  }
}

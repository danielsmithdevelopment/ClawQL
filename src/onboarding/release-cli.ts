/**
 * `clawql release` — thin wrapper over clawql-release MVP.
 */

import { resolve } from "node:path";
import {
  writeReleaseConfig,
  collectReleaseManifest,
  buildReleaseManifest,
  publishRelease,
  verifyReleaseBundle,
  verifyReleaseManifest,
} from "clawql-release";

export type ReleaseCliOptions = {
  root?: string;
  tag?: string;
  sbom?: string;
  npmTgz?: string;
  imageDigests?: Record<string, string>;
  github?: boolean;
  noCopy?: boolean;
  json?: boolean;
};

function rootDir(opts: ReleaseCliOptions): string {
  return resolve(opts.root ?? process.cwd());
}

export async function runReleaseInit(opts: ReleaseCliOptions): Promise<number> {
  const path = await writeReleaseConfig(rootDir(opts));
  console.log(`Wrote ${path}`);
  return 0;
}

export async function runReleaseCollect(opts: ReleaseCliOptions): Promise<number> {
  const manifest = await collectReleaseManifest({
    rootDir: rootDir(opts),
    tag: opts.tag,
    sbomPath: opts.sbom ? resolve(opts.sbom) : undefined,
    npmTarballPath: opts.npmTgz ? resolve(opts.npmTgz) : undefined,
    imageDigests: opts.imageDigests,
    ci: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : undefined,
    workflow: process.env.GITHUB_WORKFLOW,
  });
  if (opts.json) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    console.log(`version: ${manifest.version}`);
    console.log(`tag: ${manifest.tag}`);
    console.log(`merkleRoot: ${manifest.merkleRoot}`);
  }
  return 0;
}

export async function runReleaseManifest(opts: ReleaseCliOptions): Promise<number> {
  const { manifestPath, manifest } = await buildReleaseManifest({
    rootDir: rootDir(opts),
    tag: opts.tag,
    sbomPath: opts.sbom ? resolve(opts.sbom) : undefined,
    npmTarballPath: opts.npmTgz ? resolve(opts.npmTgz) : undefined,
    imageDigests: opts.imageDigests,
    copyArtifacts: !opts.noCopy,
  });
  console.log(`Wrote ${manifestPath}`);
  console.log(`merkleRoot: ${manifest.merkleRoot}`);
  return 0;
}

export async function runReleasePublish(opts: ReleaseCliOptions): Promise<number> {
  const result = await publishRelease({
    rootDir: rootDir(opts),
    tag: opts.tag,
    sbomPath: opts.sbom ? resolve(opts.sbom) : undefined,
    npmTarballPath: opts.npmTgz ? resolve(opts.npmTgz) : undefined,
    imageDigests: opts.imageDigests,
    copyArtifacts: !opts.noCopy,
    githubRelease: opts.github,
  });
  console.log(`Published: ${result.manifestPath}`);
  if (result.githubReleaseUrl) console.log(`GitHub: ${result.githubReleaseUrl}`);
  return 0;
}

export async function runReleaseVerify(target: string): Promise<number> {
  const abs = resolve(target);
  const result = abs.endsWith("manifest.json")
    ? await verifyReleaseManifest(abs)
    : await verifyReleaseBundle(abs);
  if (result.ok) {
    console.log(`OK — ${result.manifest.tag} merkleRoot=${result.manifest.merkleRoot}`);
    return 0;
  }
  for (const e of result.errors) console.error(`FAIL: ${e}`);
  return 1;
}

export function parseImageDigestFlags(parts: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

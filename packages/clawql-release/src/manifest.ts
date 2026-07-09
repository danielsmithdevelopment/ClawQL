import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectReleaseManifest } from "./collect.js";
import { readReleaseConfig } from "./config.js";
import type { CollectOptions, ReleaseManifestV01 } from "./types.js";

export function releaseBundleDir(rootDir: string, tag: string, configOutputDir?: string): string {
  const configDir = configOutputDir ?? "releases";
  const safeTag = tag.startsWith("v") ? tag : `v${tag}`;
  return join(rootDir, configDir, safeTag);
}

export async function writeReleaseManifest(
  rootDir: string,
  manifest: ReleaseManifestV01,
  options: { copyArtifacts?: boolean; sbomPath?: string; npmTarballPath?: string } = {}
): Promise<{ bundleDir: string; manifestPath: string }> {
  const config = await readReleaseConfig(rootDir);
  const bundleDir = releaseBundleDir(rootDir, manifest.tag, config.outputDir);
  await mkdir(bundleDir, { recursive: true });

  if (options.copyArtifacts) {
    if (options.sbomPath && manifest.artifacts.sbom?.path) {
      await copyFile(options.sbomPath, join(bundleDir, manifest.artifacts.sbom.path));
    }
    if (options.npmTarballPath && manifest.artifacts.npm?.path) {
      await copyFile(options.npmTarballPath, join(bundleDir, manifest.artifacts.npm.path));
    }
  }

  const manifestPath = join(bundleDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { bundleDir, manifestPath };
}

export async function readManifestFile(manifestPath: string): Promise<ReleaseManifestV01> {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as ReleaseManifestV01;
}

export async function buildReleaseManifest(
  options: CollectOptions & { copyArtifacts?: boolean }
): Promise<{
  manifest: ReleaseManifestV01;
  bundleDir: string;
  manifestPath: string;
}> {
  const manifest = await collectReleaseManifest(options);
  const { bundleDir, manifestPath } = await writeReleaseManifest(options.rootDir, manifest, {
    copyArtifacts: options.copyArtifacts,
    sbomPath: options.sbomPath,
    npmTarballPath: options.npmTarballPath,
  });
  return { manifest, bundleDir, manifestPath };
}

export async function findManifestInDir(dir: string): Promise<string> {
  const path = join(dir, "manifest.json");
  await readFile(path, "utf8");
  return path;
}

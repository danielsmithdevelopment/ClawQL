import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectReleaseManifest } from "./collect.js";
import { readReleaseConfig } from "./config.js";
import type { CollectOptions, ReleaseManifestV01 } from "./types.js";
import { Effect } from "effect";

export function releaseBundleDir(rootDir: string, tag: string, configOutputDir?: string): string {
  const configDir = configOutputDir ?? "releases";
  const safeTag = tag.startsWith("v") ? tag : `v${tag}`;
  return join(rootDir, configDir, safeTag);
}

async function writeReleaseManifestImpl(
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

async function readManifestFileImpl(manifestPath: string): Promise<ReleaseManifestV01> {
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as ReleaseManifestV01;
}

async function buildReleaseManifestImpl(
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

async function findManifestInDirImpl(dir: string): Promise<string> {
  const path = join(dir, "manifest.json");
  await readFile(path, "utf8");
  return path;
}

function fsError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/** Write a release manifest into the bundle directory (Effect-primary). */
export function writeReleaseManifestEffect(
  rootDir: string,
  manifest: ReleaseManifestV01,
  options: { copyArtifacts?: boolean; sbomPath?: string; npmTarballPath?: string } = {}
): Effect.Effect<{ bundleDir: string; manifestPath: string }, Error> {
  return Effect.tryPromise({
    try: () => writeReleaseManifestImpl(rootDir, manifest, options),
    catch: fsError,
  });
}

/** Promise façade for callers that still await manifest writes. */
export async function writeReleaseManifest(
  rootDir: string,
  manifest: ReleaseManifestV01,
  options: { copyArtifacts?: boolean; sbomPath?: string; npmTarballPath?: string } = {}
): Promise<{ bundleDir: string; manifestPath: string }> {
  return Effect.runPromise(writeReleaseManifestEffect(rootDir, manifest, options));
}

/** Read and parse a release manifest file (Effect-primary). */
export function readManifestFileEffect(
  manifestPath: string
): Effect.Effect<ReleaseManifestV01, Error> {
  return Effect.tryPromise({ try: () => readManifestFileImpl(manifestPath), catch: fsError });
}

/** Promise façade for callers that still await manifest reads. */
export async function readManifestFile(manifestPath: string): Promise<ReleaseManifestV01> {
  return Effect.runPromise(readManifestFileEffect(manifestPath));
}

/** Collect + write a release manifest bundle (Effect-primary). */
export function buildReleaseManifestEffect(
  options: CollectOptions & { copyArtifacts?: boolean }
): Effect.Effect<{ manifest: ReleaseManifestV01; bundleDir: string; manifestPath: string }, Error> {
  return Effect.tryPromise({ try: () => buildReleaseManifestImpl(options), catch: fsError });
}

/** Promise façade for callers that still await manifest builds. */
export async function buildReleaseManifest(
  options: CollectOptions & { copyArtifacts?: boolean }
): Promise<{
  manifest: ReleaseManifestV01;
  bundleDir: string;
  manifestPath: string;
}> {
  return Effect.runPromise(buildReleaseManifestEffect(options));
}

/** Locate manifest.json in a bundle directory (Effect-primary). */
export function findManifestInDirEffect(dir: string): Effect.Effect<string, Error> {
  return Effect.tryPromise({ try: () => findManifestInDirImpl(dir), catch: fsError });
}

/** Promise façade for callers that still await manifest path lookup. */
export async function findManifestInDir(dir: string): Promise<string> {
  return Effect.runPromise(findManifestInDirEffect(dir));
}

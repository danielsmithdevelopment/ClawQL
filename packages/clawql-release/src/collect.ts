import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { readReleaseConfig } from "./config.js";
import { readGitHead } from "./git.js";
import { sha256FileHex, sha256Utf8Hex, normalizeDigest } from "./hash.js";
import { merkleRootFromLeaves } from "./merkle.js";
import {
  MANIFEST_SCHEMA_VERSION,
  type CollectOptions,
  type ReleaseManifestV01,
  type ArtifactRecord,
  type ImageRecord,
} from "./types.js";

async function readPackageVersion(rootDir: string): Promise<string> {
  const raw = await readFile(join(rootDir, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  if (!pkg.version?.trim()) throw new Error("package.json missing version");
  return pkg.version.trim();
}

export async function collectReleaseManifest(options: CollectOptions): Promise<ReleaseManifestV01> {
  const rootDir = options.rootDir;
  const config = await readReleaseConfig(rootDir);
  const version = options.version ?? (await readPackageVersion(rootDir));
  const tag = options.tag ?? `v${version}`;
  const git = readGitHead(rootDir);

  const artifacts: Record<string, ArtifactRecord> = {};
  const merkleLeaves: Array<{ id: string; sha256: string }> = [];

  if (options.sbomPath) {
    const { hex, sizeBytes } = await sha256FileHex(options.sbomPath);
    const name = basename(options.sbomPath);
    artifacts.sbom = {
      path: name,
      sha256: hex,
      format: name.includes("cyclonedx") ? "cyclonedx-json" : "spdx-json",
      sizeBytes,
    };
    merkleLeaves.push({ id: "artifacts/sbom", sha256: hex });
  }

  if (options.npmTarballPath) {
    const { hex, sizeBytes } = await sha256FileHex(options.npmTarballPath);
    const name = basename(options.npmTarballPath);
    artifacts.npm = {
      path: name,
      sha256: hex,
      format: "npm-tarball",
      sizeBytes,
    };
    merkleLeaves.push({ id: "artifacts/npm", sha256: hex });
  }

  const images: Record<string, ImageRecord> = {};
  const digests = options.imageDigests ?? {};
  for (const [name, digest] of Object.entries(digests)) {
    const base = config.images?.[name] ?? `ghcr.io/${config.repository}/${name}`;
    const norm = normalizeDigest(digest);
    const ref = `${base}:${version}`;
    images[name] = { ref, digest: `sha256:${norm}` };
    merkleLeaves.push({ id: `images/${name}`, sha256: sha256Utf8Hex(`sha256:${norm}`) });
  }

  const { merkleRoot, leafCount } = merkleRootFromLeaves(merkleLeaves);

  const manifest: ReleaseManifestV01 = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    version,
    tag,
    publishedAt: new Date().toISOString(),
    repository: {
      url: git.remoteUrl,
      commit: git.commit,
      dirty: git.dirty,
    },
    buildEnvironment: {
      type: options.ci ? "ci" : "git-worktree",
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      ...(options.ci ? { ci: options.ci } : {}),
      ...(options.workflow ? { workflow: options.workflow } : {}),
    },
    artifacts,
    images,
    signatures: {
      cosign: {
        note: "Verify container images with cosign verify (see docs/security/golden-image-pipeline.md).",
        identityRegexp: "^https://github.com/.*/.*",
        oidcIssuerRegexp: "^https://token\\.actions\\.githubusercontent\\.com.*",
      },
      npmProvenance: Boolean(artifacts.npm),
    },
    merkleRoot,
    leafCount,
    policy: {
      compatiblePolicyVersion: "0.1",
      requireSignatures: ["cosign"],
      notes:
        "MVP Layer 0 — manifest + Merkle over artifact hashes. Permanent Arweave anchor is optional in a future release.",
    },
  };

  if (git.dirty) {
    manifest.policy.notes =
      `${manifest.policy.notes ?? ""} WARNING: git working tree was dirty at collect time.`.trim();
  }

  return manifest;
}

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { readReleaseConfig } from "./config.js";
import { readGitHead } from "./git.js";
import { sha256FileHex, sha256Utf8Hex, normalizeDigest } from "./hash.js";
import { merkleRootFromLeaves } from "./merkle.js";
import { collectOntologySchemaPin } from "./ontology-schema.js";
import { ensureReleaseSigningKey, signFile, signBytes } from "./sign.js";
import { resolveLatestSnapshot } from "./workspace/index.js";
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
  const signArtifacts = options.signArtifacts !== false;
  const signingKey = signArtifacts ? await ensureReleaseSigningKey(rootDir) : undefined;

  const artifacts: Record<string, ArtifactRecord> = {};
  const merkleLeaves: Array<{ id: string; sha256: string }> = [];

  if (options.sbomPath) {
    const { hex, sizeBytes } = await sha256FileHex(options.sbomPath);
    const name = basename(options.sbomPath);
    const art: ArtifactRecord = {
      path: name,
      sha256: hex,
      format: name.includes("cyclonedx") ? "cyclonedx-json" : "spdx-json",
      sizeBytes,
    };
    if (signingKey) {
      const { signatureHex } = await signFile(signingKey.privateKeyPem, options.sbomPath);
      art.signature = signatureHex;
      art.signer = signingKey.publicKeyHex.slice(0, 16);
    }
    artifacts.sbom = art;
    merkleLeaves.push({ id: "artifacts/sbom", sha256: hex });
  }

  if (options.npmTarballPath) {
    const { hex, sizeBytes } = await sha256FileHex(options.npmTarballPath);
    const name = basename(options.npmTarballPath);
    const art: ArtifactRecord = {
      path: name,
      sha256: hex,
      format: "npm-tarball",
      sizeBytes,
    };
    if (signingKey) {
      const { signatureHex } = await signFile(signingKey.privateKeyPem, options.npmTarballPath);
      art.signature = signatureHex;
      art.signer = signingKey.publicKeyHex.slice(0, 16);
    }
    artifacts.npm = art;
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

  const ontologySchema = await collectOntologySchemaPin(rootDir);
  if (ontologySchema) {
    merkleLeaves.push({
      id: "ontologySchema",
      sha256: ontologySchema.sha256,
    });
  }

  const { merkleRoot, leafCount } = merkleRootFromLeaves(merkleLeaves);

  const latestSnap = await resolveLatestSnapshot(
    rootDir,
    options.buildEnvironment?.type === "rift" ? "rift" : config.workspaceBackend
  );

  const buildType =
    options.buildEnvironment?.type ??
    (options.ci ? "ci" : latestSnap?.backend === "rift" ? "rift" : "git-worktree");

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
      type: buildType,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      ...(options.ci ? { ci: options.ci } : {}),
      ...(options.workflow ? { workflow: options.workflow } : {}),
      ...(latestSnap
        ? {
            snapshotId: latestSnap.snapshotId,
            parentSnapshotId: latestSnap.parentSnapshotId,
            createdAt: latestSnap.createdAt,
            workspacePath: latestSnap.path,
          }
        : {}),
      ...options.buildEnvironment,
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
      gitCommits: {
        requireSigned: config.requireSignedCommits !== false,
        signingFormat: "ssh",
      },
    },
    merkleRoot,
    leafCount,
    ...(ontologySchema ? { ontologySchema } : {}),
    policy: {
      compatiblePolicyVersion: "1.0",
      requireSignatures: ["cosign", "release-ed25519"],
      notes:
        "Layer 0 — verifiable manifest with Merkle root; optional IPFS staging, Lit encryption, Arweave permanence, and x402 access.",
    },
    collaboration: {
      primary: config.collaboration?.primary ?? "radicle",
      radicle: config.collaboration?.radicleRid
        ? { rid: config.collaboration.radicleRid }
        : undefined,
      githubMirror: config.collaboration?.githubMirrorUrl
        ? { url: config.collaboration.githubMirrorUrl }
        : undefined,
    },
  };

  if (signingKey) {
    const canonical = JSON.stringify({
      version: manifest.version,
      tag: manifest.tag,
      merkleRoot: manifest.merkleRoot,
      commit: manifest.repository.commit,
    });
    manifest.signatures.release = {
      algorithm: "ed25519",
      publicKeyHex: signingKey.publicKeyHex,
      manifestSignatureHex: signBytes(signingKey.privateKeyPem, canonical),
      signedAt: new Date().toISOString(),
    };
  }

  if (git.dirty) {
    manifest.policy.notes =
      `${manifest.policy.notes ?? ""} WARNING: git working tree was dirty at collect time.`.trim();
  }

  return manifest;
}

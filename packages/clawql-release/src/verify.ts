import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createPublicKey, verify as verifySig } from "node:crypto";
import { sha256FileHex, sha256Utf8Hex, normalizeDigest } from "./hash.js";
import { merkleRootFromLeaves } from "./merkle.js";
import { readManifestFile } from "./manifest.js";
import { verifyOntologySchemaPin } from "./ontology-schema.js";
import { fetchArweaveBundle } from "./permanence/arweave.js";
import type { VerifyResult, ReleaseManifestV01 } from "./types.js";
import { Effect } from "effect";
import { mkdir } from "node:fs/promises";

async function verifyReleaseManifestImpl(
  manifestPath: string,
  bundleDir?: string,
  options?: { workspaceRoot?: string }
): Promise<VerifyResult> {
  const manifest = await readManifestFile(manifestPath);
  const baseDir = bundleDir ?? join(manifestPath, "..");
  const errors: string[] = [];
  const warnings: string[] = [];

  if (manifest.schemaVersion !== "0.1" && manifest.schemaVersion !== "0.2") {
    errors.push(`Unsupported schemaVersion: ${manifest.schemaVersion}`);
  }

  if (manifest.repository.dirty) {
    errors.push("Manifest records dirty git tree at publish time");
  }

  const merkleLeaves: Array<{ id: string; sha256: string }> = [];

  for (const [key, art] of Object.entries(manifest.artifacts)) {
    if (art.path) {
      try {
        const { hex } = await sha256FileHex(join(baseDir, art.path));
        if (hex !== art.sha256.replace(/^sha256:/i, "")) {
          errors.push(`Artifact ${key}: sha256 mismatch (expected ${art.sha256}, got ${hex})`);
        }
        if (art.signature && manifest.signatures.release?.publicKeyHex) {
          const ok = await verifyArtifactSignature(
            join(baseDir, art.path),
            art.signature,
            manifest.signatures.release.publicKeyHex
          );
          if (!ok) errors.push(`Artifact ${key}: signature verification failed`);
        }
        merkleLeaves.push({ id: `artifacts/${key}`, sha256: hex });
      } catch (e: unknown) {
        errors.push(
          `Artifact ${key}: missing file ${art.path} (${e instanceof Error ? e.message : e})`
        );
      }
    } else {
      merkleLeaves.push({ id: `artifacts/${key}`, sha256: art.sha256 });
    }
  }

  for (const [name, img] of Object.entries(manifest.images)) {
    const norm = normalizeDigest(img.digest);
    merkleLeaves.push({ id: `images/${name}`, sha256: sha256Utf8Hex(`sha256:${norm}`) });
  }

  if (manifest.ontologySchema) {
    merkleLeaves.push({
      id: "ontologySchema",
      sha256: manifest.ontologySchema.sha256,
    });
    const workspaceRoot =
      options?.workspaceRoot ??
      process.env.CLAWQL_RELEASE_WORKSPACE?.trim() ??
      resolve(dirname(manifestPath), "..", "..");
    const pinErr = await verifyOntologySchemaPin(workspaceRoot, manifest.ontologySchema);
    if (pinErr) errors.push(pinErr);
  }

  const { merkleRoot, leafCount } = merkleRootFromLeaves(merkleLeaves);
  if (merkleRoot !== manifest.merkleRoot) {
    errors.push(`merkleRoot mismatch (expected ${manifest.merkleRoot}, computed ${merkleRoot})`);
  }
  if (leafCount !== manifest.leafCount) {
    errors.push(`leafCount mismatch (expected ${manifest.leafCount}, computed ${leafCount})`);
  }

  if (manifest.signatures.release) {
    const canonical = JSON.stringify({
      version: manifest.version,
      tag: manifest.tag,
      merkleRoot: manifest.merkleRoot,
      commit: manifest.repository.commit,
    });
    const ok = verifyManifestSignature(
      canonical,
      manifest.signatures.release.manifestSignatureHex,
      manifest.signatures.release.publicKeyHex
    );
    if (!ok) errors.push("Manifest Ed25519 signature verification failed");
  }

  if (manifest.policy.canaryPercent != null) {
    const p = manifest.policy.canaryPercent;
    if (p < 0 || p > 100) errors.push(`policy.canaryPercent out of range: ${p}`);
  }

  if (manifest.permanence?.arweave?.txId) {
    warnings.push(`permanence.arweave.txId=${manifest.permanence.arweave.txId}`);
  }
  if (manifest.staging?.ipfs?.cid) {
    warnings.push(`staging.ipfs.cid=${manifest.staging.ipfs.cid}`);
  }
  if (manifest.access?.paymentRequired) {
    warnings.push(`access.paymentRequired price=${manifest.access.price ?? "?"}`);
  }

  return { ok: errors.length === 0, errors, warnings, manifest };
}

async function verifyReleaseBundleImpl(
  bundleDir: string,
  workspaceRoot?: string
): Promise<VerifyResult> {
  const manifestPath = join(bundleDir, "manifest.json");
  await readFile(manifestPath, "utf8");
  return verifyReleaseManifest(manifestPath, bundleDir, { workspaceRoot });
}

/** Verify a local path, manifest file, or Arweave transaction id. */
async function verifyReleaseTargetImpl(
  target: string,
  options: { rootDir?: string; outDir?: string } = {}
): Promise<VerifyResult> {
  const rootDir = options.rootDir ?? process.cwd();
  if (target.endsWith("manifest.json")) {
    return verifyReleaseManifest(target, undefined, { workspaceRoot: rootDir });
  }
  if (target.includes("/") || target.includes("\\") || target.startsWith(".")) {
    return verifyReleaseBundle(target, rootDir);
  }
  // Treat as Arweave tx id
  const outDir = options.outDir ?? join(rootDir, ".clawql", "verify-cache", target.slice(0, 16));
  await mkdir(outDir, { recursive: true });
  const fetched = await fetchArweaveBundle(target, { rootDir, outDir });
  return verifyReleaseBundle(fetched.path, rootDir);
}

function verifyManifestSignature(
  canonical: string,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyHex, "hex"),
      format: "der",
      type: "spki",
    });
    return verifySig(null, Buffer.from(canonical, "utf8"), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

async function verifyArtifactSignature(
  absPath: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const buf = await readFile(absPath);
    const key = createPublicKey({
      key: Buffer.from(publicKeyHex, "hex"),
      format: "der",
      type: "spki",
    });
    return verifySig(null, buf, key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

export type { ReleaseManifestV01 };

function fsError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/** Verify a release manifest against its bundle (Effect-primary). */
export function verifyReleaseManifestEffect(
  manifestPath: string,
  bundleDir?: string,
  options?: { workspaceRoot?: string }
): Effect.Effect<VerifyResult, Error> {
  return Effect.tryPromise({
    try: () => verifyReleaseManifestImpl(manifestPath, bundleDir, options),
    catch: fsError,
  });
}

/** Promise façade for callers that still await manifest verify. */
export async function verifyReleaseManifest(
  manifestPath: string,
  bundleDir?: string,
  options?: { workspaceRoot?: string }
): Promise<VerifyResult> {
  return Effect.runPromise(verifyReleaseManifestEffect(manifestPath, bundleDir, options));
}

/** Verify a release bundle directory (Effect-primary). */
export function verifyReleaseBundleEffect(
  bundleDir: string,
  workspaceRoot?: string
): Effect.Effect<VerifyResult, Error> {
  return Effect.tryPromise({
    try: () => verifyReleaseBundleImpl(bundleDir, workspaceRoot),
    catch: fsError,
  });
}

/** Promise façade for callers that still await bundle verify. */
export async function verifyReleaseBundle(
  bundleDir: string,
  workspaceRoot?: string
): Promise<VerifyResult> {
  return Effect.runPromise(verifyReleaseBundleEffect(bundleDir, workspaceRoot));
}

/** Verify a local path, manifest file, or Arweave tx id (Effect-primary). */
export function verifyReleaseTargetEffect(
  target: string,
  options: { rootDir?: string; outDir?: string } = {}
): Effect.Effect<VerifyResult, Error> {
  return Effect.tryPromise({ try: () => verifyReleaseTargetImpl(target, options), catch: fsError });
}

/** Promise façade for callers that still await target verify. */
export async function verifyReleaseTarget(
  target: string,
  options: { rootDir?: string; outDir?: string } = {}
): Promise<VerifyResult> {
  return Effect.runPromise(verifyReleaseTargetEffect(target, options));
}

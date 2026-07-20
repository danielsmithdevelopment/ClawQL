import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { sha256FileHex, sha256Utf8Hex, normalizeDigest } from "./hash.js";
import { merkleRootFromLeaves } from "./merkle.js";
import { readManifestFile } from "./manifest.js";
import { verifyOntologySchemaPin } from "./ontology-schema.js";
import type { VerifyResult } from "./types.js";

export async function verifyReleaseManifest(
  manifestPath: string,
  bundleDir?: string,
  options?: { workspaceRoot?: string }
): Promise<VerifyResult> {
  const manifest = await readManifestFile(manifestPath);
  const baseDir = bundleDir ?? join(manifestPath, "..");
  const errors: string[] = [];

  if (manifest.schemaVersion !== "0.1") {
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
      // Bundle lives under releases/vX — climb to repo root when verifying in-tree.
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

  return { ok: errors.length === 0, errors, manifest };
}

export async function verifyReleaseBundle(
  bundleDir: string,
  workspaceRoot?: string
): Promise<VerifyResult> {
  const manifestPath = join(bundleDir, "manifest.json");
  await readFile(manifestPath, "utf8");
  return verifyReleaseManifest(manifestPath, bundleDir, { workspaceRoot });
}

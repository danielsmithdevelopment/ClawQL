/**
 * Immutable release manifest (ClawQL vision shape) + Merkle root over bundle files.
 * Leaves: SHA-256 of each file, ordered by path.
 */

import { createHash } from "node:crypto";

export type BundleFile = {
  path: string;
  bytes: Uint8Array | Buffer;
};

export type ReleaseManifest = {
  version: string;
  merkleRoot: string;
  artifacts: Record<string, { sha256: string; path: string }>;
  buildEnvironment: {
    type: "artifacts-fork";
    /** Winning attempt fork name */
    fork: string;
    commit: string;
    taskId: string;
    attemptId: string;
    createdAt: string;
  };
  policy: {
    canaryPercent: number;
    blastRadiusCap: string;
    rollback: {
      previousRelease: string | null;
      trigger: string;
    };
  };
  permanence?: {
    arweave: { txId: string; gateway: string };
  };
  compatiblePolicyVersion: "1.0";
};

function sha256Hex(data: Uint8Array | Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Merkle root: binary tree over path-sorted file content hashes (SHA-256). */
export function merkleRootForBundle(files: readonly BundleFile[]): string {
  const leaves = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => sha256Hex(f.bytes));

  if (leaves.length === 0) {
    return sha256Hex("");
  }

  let layer = leaves;
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i]!;
      const right = layer[i + 1] ?? left;
      next.push(sha256Hex(left + right));
    }
    layer = next;
  }
  return layer[0]!;
}

export function artifactDigests(files: readonly BundleFile[]): Record<string, { sha256: string; path: string }> {
  const out: Record<string, { sha256: string; path: string }> = {};
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    out[f.path] = { sha256: sha256Hex(f.bytes), path: f.path };
  }
  return out;
}

export function buildReleaseManifest(input: {
  version: string;
  files: readonly BundleFile[];
  buildEnvironment: ReleaseManifest["buildEnvironment"];
  canaryPercent: number;
  previousRelease?: string | null;
  rollbackTrigger?: string;
}): ReleaseManifest {
  return {
    version: input.version,
    merkleRoot: merkleRootForBundle(input.files),
    artifacts: artifactDigests(input.files),
    buildEnvironment: input.buildEnvironment,
    policy: {
      canaryPercent: input.canaryPercent,
      blastRadiusCap: "single-worker",
      rollback: {
        previousRelease: input.previousRelease ?? null,
        trigger: input.rollbackTrigger ?? "error_rate > 1% for 5min",
      },
    },
    compatiblePolicyVersion: "1.0",
  };
}

export function verifyBundleAgainstManifest(
  manifest: ReleaseManifest,
  files: readonly BundleFile[]
): { ok: true } | { ok: false; reason: string } {
  const root = merkleRootForBundle(files);
  if (root !== manifest.merkleRoot) {
    return { ok: false, reason: `merkleRoot mismatch: got ${root}, expected ${manifest.merkleRoot}` };
  }
  for (const [path, meta] of Object.entries(manifest.artifacts)) {
    const file = files.find((f) => f.path === path);
    if (!file) {
      return { ok: false, reason: `missing artifact ${path}` };
    }
    const digest = sha256Hex(file.bytes);
    if (digest !== meta.sha256) {
      return { ok: false, reason: `sha256 mismatch for ${path}` };
    }
  }
  return { ok: true };
}

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { commandExists, isDryRun, runCommand } from "./exec.js";
import { readReleaseConfig } from "./config.js";
import { ensureReleaseSigningKey, signBytes } from "./sign.js";
import { sha256Utf8Hex } from "./hash.js";
import type { ImageRecord } from "./types.js";

export type GoldenImageBuildOptions = {
  rootDir: string;
  version?: string;
  imageDigests?: Record<string, string>;
  dryRun?: boolean;
};

export type GoldenImageBuildResult = {
  images: Record<string, ImageRecord>;
  sbomPath?: string;
  attestationsPath: string;
  signed: boolean;
  detail: string[];
};

/**
 * Produce signed image references, SBOM placeholder hooks, and attestations
 * for the release manifest. Uses cosign when available; always writes an
 * Ed25519-signed attestation document for verify.
 */
export async function buildGoldenImages(
  options: GoldenImageBuildOptions
): Promise<GoldenImageBuildResult> {
  const config = await readReleaseConfig(options.rootDir);
  const detail: string[] = [];
  const dry = isDryRun(options.dryRun);
  const version = options.version ?? "0.0.0";
  const images: Record<string, ImageRecord> = {};
  const digests = options.imageDigests ?? {};

  for (const [name, base] of Object.entries(config.images ?? {})) {
    const digest = digests[name];
    if (!digest) continue;
    const norm = digest.replace(/^sha256:/i, "");
    const ref = `${base}:${version}`;
    images[name] = {
      ref,
      digest: `sha256:${norm}`,
    };

    if (!dry && commandExists("cosign")) {
      const verify = runCommand("cosign", ["verify", `${base}@sha256:${norm}`], {
        allowFailure: true,
      });
      if (verify.status === 0) {
        images[name]!.signatureRef = `cosign:${base}@sha256:${norm}`;
        detail.push(`cosign verify ok for ${name}`);
      } else {
        detail.push(`cosign verify skipped/failed for ${name}: ${verify.stderr || verify.stdout}`);
      }
    }
  }

  const key = await ensureReleaseSigningKey(options.rootDir);
  const attestation = {
    version,
    images,
    producedAt: new Date().toISOString(),
    policy: {
      requireSignatures: ["cosign", "release-ed25519"],
    },
  };
  const body = `${JSON.stringify(attestation, null, 2)}\n`;
  const sig = signBytes(key.privateKeyPem, body);
  const outDir = join(options.rootDir, ".clawql", "golden-image");
  await mkdir(outDir, { recursive: true });
  const attestationsPath = join(outDir, `attestations-${version}.json`);
  await writeFile(
    attestationsPath,
    `${JSON.stringify(
      {
        attestation,
        signature: { algorithm: "ed25519", publicKeyHex: key.publicKeyHex, signatureHex: sig },
        contentSha256: sha256Utf8Hex(body),
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  detail.push(`wrote signed attestations at ${attestationsPath}`);

  // Optional: generate SBOM via syft if present
  let sbomPath: string | undefined;
  if (!dry && commandExists("syft") && Object.keys(images).length) {
    sbomPath = join(outDir, `sbom-${version}.cdx.json`);
    const first = Object.values(images)[0]!;
    const r = runCommand("syft", [`${first.ref}`, "-o", `cyclonedx-json=${sbomPath}`], {
      allowFailure: true,
    });
    if (r.status !== 0) {
      sbomPath = undefined;
      detail.push("syft SBOM generation skipped/failed");
    } else {
      detail.push(`syft SBOM at ${sbomPath}`);
    }
  }

  return {
    images,
    sbomPath,
    attestationsPath,
    signed: true,
    detail,
  };
}

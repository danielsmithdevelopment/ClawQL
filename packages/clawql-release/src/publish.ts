import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { buildReleaseManifest } from "./manifest.js";
import { stageBundleToIpfs } from "./staging/ipfs.js";
import { uploadBundleToArweave } from "./permanence/arweave.js";
import { syncCollaborationRemotes } from "./collaboration/index.js";
import { buildAccessRecord } from "./access/x402.js";
import { encryptFileToPath } from "./crypto/encrypt.js";
import { writeEscrowKey } from "./pull.js";
import { readReleaseConfig } from "./config.js";
import { commandExists, isDryRun } from "./exec.js";
import type { PublishOptions, ReleaseManifestV01 } from "./types.js";

export type PublishResult = {
  manifestPath: string;
  bundleDir: string;
  githubReleaseUrl?: string;
  ipfsCid?: string;
  arweaveTxId?: string;
  encrypted?: boolean;
  manifest: ReleaseManifestV01;
};

export async function publishRelease(options: PublishOptions): Promise<PublishResult> {
  const dry = isDryRun(options.dryRun);
  const config = await readReleaseConfig(options.rootDir);

  const { manifest, bundleDir, manifestPath } = await buildReleaseManifest({
    ...options,
    copyArtifacts: options.copyArtifacts !== false,
  });

  let workingManifest = manifest;
  let githubReleaseUrl: string | undefined;
  let ipfsCid: string | undefined;
  let arweaveTxId: string | undefined;
  let encrypted = false;

  // Optional encryption of a tar.gz of the bundle before permanence
  if (options.encrypt) {
    await mkdir(join(options.rootDir, ".clawql", "tmp"), { recursive: true });
    const archivePath = join(
      options.rootDir,
      ".clawql",
      "tmp",
      `${workingManifest.tag.replace(/[^a-zA-Z0-9._-]/g, "_")}.tar.gz`
    );
    await tarGzDirectory(bundleDir, archivePath);
    const encPath = join(bundleDir, "bundle.enc");
    const blob = await encryptFileToPath(archivePath, encPath);
    await writeEscrowKey(options.rootDir, workingManifest.tag, blob.keyHex);
    encrypted = true;
    workingManifest = {
      ...workingManifest,
      access: buildAccessRecord({
        encrypt: true,
        price: options.price ?? config.access?.defaultPrice,
        wallet: config.access?.wallet,
        asset: config.access?.asset,
        network: config.access?.network,
        encryption: {
          algorithm: "chacha20-poly1305",
          nonceHex: blob.nonceHex,
          ciphertextPath: "bundle.enc",
          wrappedKeyHint: "escrow:.clawql/escrow/<tag>.key (Lit releases CEK after x402 receipt)",
        },
      }),
    };
  } else if (options.price) {
    workingManifest = {
      ...workingManifest,
      access: buildAccessRecord({
        encrypt: false,
        price: options.price,
        wallet: config.access?.wallet,
        asset: config.access?.asset,
        network: config.access?.network,
      }),
    };
  } else {
    workingManifest = {
      ...workingManifest,
      access: workingManifest.access ?? { public: true, paymentRequired: false },
    };
  }

  if (options.stageIpfs || options.permanent) {
    const staged = await stageBundleToIpfs(bundleDir, {
      rootDir: options.rootDir,
      dryRun: dry || config.permanence?.dryRun,
      apiUrl: config.permanence?.ipfsApiUrl,
    });
    ipfsCid = staged.cid;
    workingManifest = {
      ...workingManifest,
      staging: {
        ipfs: {
          cid: staged.cid,
          gateway: staged.gateway,
          stagedAt: staged.stagedAt,
          mode: staged.mode,
        },
      },
    };
    // Annotate artifacts with cid when present
    for (const art of Object.values(workingManifest.artifacts)) {
      art.cid = staged.cid;
    }
  }

  if (options.permanent) {
    // Persist updated manifest before upload
    await writeFile(manifestPath, `${JSON.stringify(workingManifest, null, 2)}\n`, "utf8");
    const uploaded = await uploadBundleToArweave(bundleDir, {
      rootDir: options.rootDir,
      merkleRoot: workingManifest.merkleRoot,
      encrypted,
      dryRun: dry || config.permanence?.dryRun,
      gateway: config.permanence?.arweaveGateway,
    });
    arweaveTxId = uploaded.txId;
    workingManifest = {
      ...workingManifest,
      permanence: {
        arweave: {
          txId: uploaded.txId,
          gateway: uploaded.gateway,
          uploadedAt: uploaded.uploadedAt,
          mode: uploaded.mode,
          encrypted: uploaded.encrypted,
        },
      },
    };
  }

  const shouldSync =
    options.syncCollaboration !== false && (options.permanent || options.githubRelease);
  if (shouldSync) {
    const sync = await syncCollaborationRemotes({
      rootDir: options.rootDir,
      arweaveTxId,
      dryRun: dry,
    });
    workingManifest = {
      ...workingManifest,
      collaboration: sync.collaboration,
    };
  }

  await writeFile(manifestPath, `${JSON.stringify(workingManifest, null, 2)}\n`, "utf8");

  if (options.githubRelease) {
    githubReleaseUrl = attachGitHubRelease(
      options.rootDir,
      workingManifest.tag,
      manifestPath,
      workingManifest.merkleRoot,
      arweaveTxId
    );
  }

  return {
    manifestPath,
    bundleDir,
    githubReleaseUrl,
    ipfsCid,
    arweaveTxId,
    encrypted,
    manifest: workingManifest,
  };
}

async function tarGzDirectory(dir: string, outPath: string): Promise<void> {
  // Prefer system tar when available.
  const tar = spawnSync("tar", ["-czf", outPath, "-C", dir, "."], { encoding: "utf8" });
  if (tar.status === 0) return;

  // Fallback: gzip the manifest alone so encrypt/publish still works in constrained envs
  const manifest = join(dir, "manifest.json");
  await pipeline(createReadStream(manifest), createGzip(), createWriteStream(outPath));
}

function attachGitHubRelease(
  rootDir: string,
  tag: string,
  manifestPath: string,
  merkleRoot: string,
  arweaveTxId?: string
): string | undefined {
  if (!commandExists("gh")) {
    console.error("[clawql-release] gh CLI not found — skip GitHub Release attach");
    return undefined;
  }

  const notes = [
    `Immutable release manifest (Layer 0).`,
    ``,
    `Merkle root: \`${merkleRoot}\``,
    arweaveTxId ? `Arweave tx: \`${arweaveTxId}\`` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const viewExisting = spawnSync("gh", ["release", "view", tag], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (viewExisting.status !== 0) {
    const createRel = spawnSync(
      "gh",
      ["release", "create", tag, "--title", `ClawQL ${tag}`, "--notes", notes],
      { cwd: rootDir, encoding: "utf8", stdio: "pipe" }
    );
    if (createRel.status !== 0) {
      console.error(
        "[clawql-release] gh release create failed:",
        createRel.stderr || createRel.stdout
      );
      return undefined;
    }
  }

  const upload = spawnSync("gh", ["release", "upload", tag, manifestPath, "--clobber"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (upload.status !== 0) {
    console.error("[clawql-release] gh release upload failed:", upload.stderr || upload.stdout);
  }

  const view = spawnSync("gh", ["release", "view", tag, "--json", "url", "-q", ".url"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  return view.stdout?.trim() || undefined;
}

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchArweaveBundle } from "./permanence/arweave.js";
import { verifyReleaseManifest, verifyReleaseBundle } from "./verify.js";
import { accessFromManifest, payForReleaseAccess } from "./access/x402.js";
import { requestLitDecryptionKey } from "./crypto/lit.js";
import { decryptBuffer } from "./crypto/encrypt.js";
import { createWorkspaceSnapshot } from "./workspace/index.js";
import type { ReleaseManifestV01, WorkspaceBackend } from "./types.js";
import { isDryRun } from "./exec.js";

export type PullOptions = {
  rootDir: string;
  /** Local bundle dir, manifest path, or Arweave tx id. */
  target: string;
  outDir?: string;
  rift?: boolean;
  backend?: WorkspaceBackend;
  dryRun?: boolean;
  paymentHeader?: string;
  /** Escrowed CEK for local/dry-run Lit release (tests / publisher cache). */
  escrowKeyHex?: string;
};

export type PullResult = {
  ok: boolean;
  errors: string[];
  manifest: ReleaseManifestV01;
  outDir: string;
  workspacePath?: string;
  decrypted?: boolean;
};

function looksLikeTxId(target: string): boolean {
  if (target.endsWith("manifest.json") || target.includes("/") || target.includes("\\")) {
    return false;
  }
  return /^(local_[a-f0-9]+|[a-zA-Z0-9_-]{20,})$/.test(target);
}

/**
 * Pull + verify a release (local bundle or Arweave tx), pay/decrypt when required,
 * optionally materialize into a Rift / git-worktree workspace.
 */
export async function pullRelease(options: PullOptions): Promise<PullResult> {
  const errors: string[] = [];
  const dry = isDryRun(options.dryRun);
  const outDir =
    options.outDir ?? join(options.rootDir, ".clawql", "pulled", Date.now().toString(36));
  await mkdir(outDir, { recursive: true });

  let bundleDir = outDir;
  if (looksLikeTxId(options.target)) {
    const fetched = await fetchArweaveBundle(options.target, {
      rootDir: options.rootDir,
      outDir,
    });
    bundleDir = fetched.path;
  } else if (options.target.endsWith("manifest.json")) {
    const raw = await readFile(options.target, "utf8");
    await writeFile(join(outDir, "manifest.json"), raw, "utf8");
    bundleDir = outDir;
  } else {
    bundleDir = options.target;
  }

  const verified = await verifyReleaseBundle(bundleDir, options.rootDir);
  if (!verified.ok) {
    return { ok: false, errors: verified.errors, manifest: verified.manifest, outDir: bundleDir };
  }

  let manifest = verified.manifest;
  let decrypted = false;
  const access = accessFromManifest(manifest);

  if (access.paymentRequired || access.encryption) {
    const payment = await payForReleaseAccess(
      {
        amount: access.price ?? "0",
        recipient: access.wallet ?? "",
        resource: manifest.permanence?.arweave?.txId ?? manifest.tag,
        asset: access.asset,
        network: access.network,
      },
      { dryRun: dry, paymentHeader: options.paymentHeader }
    );
    if (!payment.ok) {
      errors.push(`x402 payment failed: ${payment.detail}`);
      return { ok: false, errors, manifest, outDir: bundleDir };
    }

    if (access.encryption && access.decryptCondition) {
      const escrow =
        options.escrowKeyHex ??
        process.env.CLAWQL_RELEASE_ESCROW_KEY ??
        (await readEscrowKey(options.rootDir, manifest.tag));
      const lit = await requestLitDecryptionKey(
        {
          condition: access.decryptCondition,
          proof: { receipt: payment.receipt, resource: manifest.tag, amount: access.price },
          escrowKeyHex: escrow,
        },
        { dryRun: dry }
      );
      if (!lit.ok || !lit.keyHex) {
        errors.push(`Lit key release failed: ${lit.detail}`);
        return { ok: false, errors, manifest, outDir: bundleDir };
      }

      const encPath = access.encryption.ciphertextPath
        ? join(bundleDir, access.encryption.ciphertextPath)
        : join(bundleDir, "bundle.enc");
      try {
        const ciphertext = await readFile(encPath);
        const plain = decryptBuffer({
          algorithm: "chacha20-poly1305",
          nonceHex: access.encryption.nonceHex,
          ciphertextHex: ciphertext.toString("hex"),
          keyHex: lit.keyHex,
        });
        await writeFile(join(outDir, "bundle.decrypted"), plain);
        decrypted = true;
      } catch (e: unknown) {
        errors.push(`decrypt failed: ${e instanceof Error ? e.message : e}`);
        return { ok: false, errors, manifest, outDir: bundleDir };
      }
    }
  }

  let workspacePath: string | undefined;
  if (options.rift || options.backend) {
    const backend = options.backend ?? (options.rift ? "rift" : "git-worktree");
    const snap = await createWorkspaceSnapshot({
      rootDir: options.rootDir,
      backend,
      name: `pull-${manifest.tag.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
      parentSnapshotId: manifest.buildEnvironment.snapshotId,
    });
    workspacePath = snap.path;
    manifest = {
      ...manifest,
      buildEnvironment: {
        ...manifest.buildEnvironment,
        type: backend === "rift" ? "rift" : manifest.buildEnvironment.type,
        workspacePath: snap.path,
      },
    };
  }

  // Re-verify after pull materialization when we still have artifact paths
  const recheck = await verifyReleaseManifest(join(bundleDir, "manifest.json"), bundleDir, {
    workspaceRoot: options.rootDir,
  });
  if (!recheck.ok) {
    errors.push(...recheck.errors);
  }

  return {
    ok: errors.length === 0,
    errors,
    manifest,
    outDir: bundleDir,
    workspacePath,
    decrypted,
  };
}

async function readEscrowKey(rootDir: string, tag: string): Promise<string | undefined> {
  try {
    const raw = await readFile(
      join(rootDir, ".clawql", "escrow", `${tag.replace(/[^a-zA-Z0-9._-]/g, "_")}.key`),
      "utf8"
    );
    return raw.trim();
  } catch {
    return undefined;
  }
}

export async function writeEscrowKey(
  rootDir: string,
  tag: string,
  keyHex: string
): Promise<string> {
  const dir = join(rootDir, ".clawql", "escrow");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${tag.replace(/[^a-zA-Z0-9._-]/g, "_")}.key`);
  await writeFile(path, `${keyHex}\n`, { encoding: "utf8", mode: 0o600 });
  return path;
}

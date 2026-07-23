import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { commandExists, isDryRun, runCommand } from "../exec.js";
import { sha256FileHex } from "../hash.js";

export type IpfsStageResult = {
  cid: string;
  gateway?: string;
  stagedAt: string;
  mode: "ipfs" | "local-content-addressed";
  localPath?: string;
};

/** Deterministic local content id when kubo/IPFS is unavailable (not a real CIDv1). */
export function localContentId(sha256Hex: string): string {
  return `clawql-cid:sha256:${sha256Hex.replace(/^sha256:/i, "")}`;
}

async function hashDirectory(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  const parts: string[] = [];
  for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      parts.push(`${ent.name}/${await hashDirectory(p)}`);
    } else if (ent.isFile()) {
      const { hex } = await sha256FileHex(p);
      parts.push(`${ent.name}:${hex}`);
    }
  }
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex");
}

/**
 * Stage a release bundle directory on IPFS. Falls back to a local content-addressed
 * store under `.clawql/ipfs-staging/` when the IPFS daemon/CLI is unavailable or dry-run.
 */
export async function stageBundleToIpfs(
  bundleDir: string,
  opts: { rootDir: string; dryRun?: boolean; apiUrl?: string } = { rootDir: "." }
): Promise<IpfsStageResult> {
  const dry = isDryRun(opts.dryRun);
  const stagedAt = new Date().toISOString();

  if (!dry && commandExists("ipfs")) {
    const add = runCommand("ipfs", ["add", "-Q", "-r", bundleDir], { allowFailure: true });
    if (add.status === 0 && add.stdout.trim()) {
      const cid = add.stdout.trim();
      return {
        cid,
        gateway: process.env.CLAWQL_IPFS_GATEWAY ?? "https://ipfs.io/ipfs",
        stagedAt,
        mode: "ipfs",
      };
    }
  }

  // Local content-addressed staging
  const digest = await hashDirectory(bundleDir);
  const cid = localContentId(digest);
  const dest = join(opts.rootDir, ".clawql", "ipfs-staging", digest);
  await mkdir(dest, { recursive: true });
  // Copy manifest pointer
  const meta = {
    cid,
    source: bundleDir,
    stagedAt,
    mode: "local-content-addressed" as const,
  };
  await writeFile(join(dest, "staging.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  // Copy key files by name for later pull
  try {
    const files = await readdir(bundleDir);
    for (const f of files) {
      const src = join(bundleDir, f);
      const st = await stat(src);
      if (st.isFile()) {
        const buf = await readFile(src);
        await writeFile(join(dest, basename(f)), buf);
      }
    }
  } catch {
    // ignore copy errors — meta is enough for dry-run
  }

  return {
    cid,
    gateway: `file://${dest}`,
    stagedAt,
    mode: "local-content-addressed",
    localPath: dest,
  };
}

export async function resolveLocalIpfsStaging(
  rootDir: string,
  cid: string
): Promise<string | undefined> {
  const hex = cid.replace(/^clawql-cid:sha256:/, "");
  const dest = join(rootDir, ".clawql", "ipfs-staging", hex);
  try {
    await readFile(join(dest, "staging.json"), "utf8");
    return dest;
  } catch {
    return undefined;
  }
}

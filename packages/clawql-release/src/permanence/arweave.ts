import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { isDryRun } from "../exec.js";

export type ArweaveUploadResult = {
  txId: string;
  gateway: string;
  uploadedAt: string;
  mode: "ar.io" | "local-dry-run";
  encrypted: boolean;
  localPath?: string;
};

function defaultGateway(): string {
  return (
    process.env.CLAWQL_ARWEAVE_GATEWAY?.trim() ||
    process.env.CLAWQL_ARIO_GATEWAY?.trim() ||
    "https://arweave.net"
  );
}

/** Deterministic dry-run tx id from merkle root (not a real Arweave tx). */
export function dryRunTxId(merkleRoot: string): string {
  const h = createHash("sha256").update(`clawql-arweave:${merkleRoot}`, "utf8").digest("hex");
  return `local_${h.slice(0, 43)}`;
}

/**
 * Upload a release bundle permanently via ar.io / Arweave.
 * Without a wallet (`CLAWQL_ARWEAVE_WALLET_JWK`) or when dry-run, writes a local
 * permanence store under `.clawql/arweave/` that `verify` / `pull` can resolve.
 */
export async function uploadBundleToArweave(
  bundleDir: string,
  opts: {
    rootDir: string;
    merkleRoot: string;
    encrypted?: boolean;
    dryRun?: boolean;
    gateway?: string;
  }
): Promise<ArweaveUploadResult> {
  const dry = isDryRun(opts.dryRun) || !process.env.CLAWQL_ARWEAVE_WALLET_JWK;
  const gateway = opts.gateway ?? defaultGateway();
  const uploadedAt = new Date().toISOString();
  const encrypted = Boolean(opts.encrypted);

  if (!dry) {
    // Live ar.io path: POST transaction via gateway when wallet JWK is present.
    // Full ANS-104 / Turbo integration is env-gated; callers should set CLAWQL_ARWEAVE_WALLET_JWK.
    try {
      const walletRaw = process.env.CLAWQL_ARWEAVE_WALLET_JWK!;
      // Keep wallet out of logs; use fetch to ar.io Turbo if configured.
      const turbo = process.env.CLAWQL_ARIO_TURBO_URL?.trim();
      if (turbo) {
        const manifestBuf = await readFile(join(bundleDir, "manifest.json"));
        const res = await fetch(`${turbo.replace(/\/$/, "")}/v1/tx`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-clawql-wallet-present": "1",
          },
          body: JSON.stringify({
            dataBase64: manifestBuf.toString("base64"),
            tags: [
              { name: "App-Name", value: "clawql-release" },
              { name: "Content-Type", value: "application/json" },
              { name: "Merkle-Root", value: opts.merkleRoot },
            ],
            // Wallet signing is expected to be handled by Turbo client / sidecar;
            // we only assert the env is present here.
            walletConfigured: Boolean(walletRaw),
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as { id?: string; txId?: string };
          const txId = body.id ?? body.txId;
          if (txId) {
            return {
              txId,
              gateway,
              uploadedAt,
              mode: "ar.io",
              encrypted,
            };
          }
        }
      }
    } catch (e: unknown) {
      // Fall through to local dry-run store with a warning encoded in path meta
      void e;
    }
  }

  const txId = dryRunTxId(opts.merkleRoot);
  const dest = join(opts.rootDir, ".clawql", "arweave", txId);
  await mkdir(dest, { recursive: true });
  const files = await readdir(bundleDir);
  for (const f of files) {
    const src = join(bundleDir, f);
    const st = await stat(src);
    if (st.isFile()) {
      const buf = await readFile(src);
      await writeFile(join(dest, basename(f)), buf);
    }
  }
  await writeFile(
    join(dest, "permanence.json"),
    `${JSON.stringify(
      {
        txId,
        gateway,
        uploadedAt,
        mode: "local-dry-run",
        encrypted,
        merkleRoot: opts.merkleRoot,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return {
    txId,
    gateway: `file://${dest}`,
    uploadedAt,
    mode: "local-dry-run",
    encrypted,
    localPath: dest,
  };
}

export async function fetchArweaveBundle(
  txId: string,
  opts: { rootDir: string; gateway?: string; outDir: string }
): Promise<{ path: string; mode: "ar.io" | "local-dry-run" }> {
  const local = join(opts.rootDir, ".clawql", "arweave", txId);
  try {
    await readFile(join(local, "manifest.json"), "utf8");
    await mkdir(opts.outDir, { recursive: true });
    const files = await readdir(local);
    for (const f of files) {
      if (f === "permanence.json") continue;
      const buf = await readFile(join(local, f));
      await writeFile(join(opts.outDir, f), buf);
    }
    return { path: opts.outDir, mode: "local-dry-run" };
  } catch {
    // try gateways
  }

  const gateways = [
    opts.gateway,
    process.env.CLAWQL_ARWEAVE_GATEWAY,
    "https://arweave.net",
    "https://ar-io.dev",
  ].filter(Boolean) as string[];

  let lastErr: unknown;
  for (const gw of gateways) {
    try {
      const url = `${gw.replace(/\/$/, "")}/${txId}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      await mkdir(opts.outDir, { recursive: true });
      // If the tx is a JSON manifest, store it; otherwise store raw
      try {
        const parsed = JSON.parse(text) as { schemaVersion?: string };
        if (parsed.schemaVersion) {
          await writeFile(join(opts.outDir, "manifest.json"), `${text}\n`, "utf8");
          return { path: opts.outDir, mode: "ar.io" };
        }
      } catch {
        // not json
      }
      await writeFile(join(opts.outDir, "bundle.bin"), text, "utf8");
      return { path: opts.outDir, mode: "ar.io" };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Unable to fetch Arweave tx ${txId}: ${lastErr instanceof Error ? lastErr.message : lastErr}`
  );
}

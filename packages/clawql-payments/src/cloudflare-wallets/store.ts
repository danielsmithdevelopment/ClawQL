/**
 * Local Virtual Wallet ledger until Cloudflare Wallets HTTP API ships.
 * Persists under $CLAWQL_HOME/Payments/cloudflare-virtual-wallets.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePaymentsDir } from "../config/paths.js";

export type CloudflareVirtualWalletRecord = {
  readonly id: string;
  readonly handle: string;
  readonly agentId: string;
  readonly allowanceUsd: number;
  readonly maxTxUsd?: number;
  readonly merchantAllowList: string[];
  readonly status: "active" | "revoked";
  readonly tenantId?: string;
  readonly credentialHint?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly spentUsd: number;
  readonly dryRun: boolean;
};

type StoreFile = {
  wallets: Record<string, CloudflareVirtualWalletRecord>;
};

export function resolveCloudflareVirtualWalletsPath(
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${resolvePaymentsDir(env)}/cloudflare-virtual-wallets.json`;
}

async function loadFile(env: NodeJS.ProcessEnv): Promise<StoreFile> {
  const path = resolveCloudflareVirtualWalletsPath(env);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!parsed || typeof parsed !== "object" || !parsed.wallets) return { wallets: {} };
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { wallets: {} };
    throw err;
  }
}

async function saveFile(env: NodeJS.ProcessEnv, data: StoreFile): Promise<void> {
  const path = resolveCloudflareVirtualWalletsPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function upsertVirtualWallet(
  env: NodeJS.ProcessEnv,
  record: CloudflareVirtualWalletRecord
): Promise<CloudflareVirtualWalletRecord> {
  const file = await loadFile(env);
  file.wallets[record.id] = record;
  await saveFile(env, file);
  return record;
}

export async function getVirtualWallet(
  env: NodeJS.ProcessEnv,
  walletId: string
): Promise<CloudflareVirtualWalletRecord | undefined> {
  const file = await loadFile(env);
  return file.wallets[walletId];
}

export async function listVirtualWallets(
  env: NodeJS.ProcessEnv,
  filter?: { agentId?: string; handle?: string; status?: "active" | "revoked" }
): Promise<CloudflareVirtualWalletRecord[]> {
  const file = await loadFile(env);
  return Object.values(file.wallets).filter((w) => {
    if (filter?.agentId && w.agentId !== filter.agentId) return false;
    if (filter?.handle && w.handle !== filter.handle) return false;
    if (filter?.status && w.status !== filter.status) return false;
    return true;
  });
}

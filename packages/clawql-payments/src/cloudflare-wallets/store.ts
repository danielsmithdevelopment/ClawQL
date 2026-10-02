/**
 * Local Virtual Wallet ledger until Cloudflare Wallets HTTP API ships.
 * Persists under $CLAWQL_HOME/Payments/cloudflare-virtual-wallets.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
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

export function resolveCloudflareVirtualWalletsPath(env: NodeJS.ProcessEnv = process.env): string {
  return `${resolvePaymentsDir(env)}/cloudflare-virtual-wallets.json`;
}

export class CloudflareWalletStoreError extends Data.TaggedError("CloudflareWalletStoreError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

function loadFileEffect(env: NodeJS.ProcessEnv): Effect.Effect<StoreFile, CloudflareWalletStoreError> {
  return Effect.tryPromise({
    try: async () => {
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
    },
    catch: (cause) =>
      new CloudflareWalletStoreError({
        reason: cause instanceof Error ? cause.message : "Failed to load virtual wallet store",
        cause,
      }),
  });
}

function saveFileEffect(
  env: NodeJS.ProcessEnv,
  data: StoreFile
): Effect.Effect<void, CloudflareWalletStoreError> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolveCloudflareVirtualWalletsPath(env);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    },
    catch: (cause) =>
      new CloudflareWalletStoreError({
        reason: cause instanceof Error ? cause.message : "Failed to save virtual wallet store",
        cause,
      }),
  });
}

export function upsertVirtualWalletEffect(
  env: NodeJS.ProcessEnv,
  record: CloudflareVirtualWalletRecord
): Effect.Effect<CloudflareVirtualWalletRecord, CloudflareWalletStoreError> {
  return Effect.gen(function* () {
    const file = yield* loadFileEffect(env);
    file.wallets[record.id] = record;
    yield* saveFileEffect(env, file);
    return record;
  });
}

export function getVirtualWalletEffect(
  env: NodeJS.ProcessEnv,
  walletId: string
): Effect.Effect<CloudflareVirtualWalletRecord | undefined, CloudflareWalletStoreError> {
  return Effect.gen(function* () {
    const file = yield* loadFileEffect(env);
    return file.wallets[walletId];
  });
}

export type ListVirtualWalletsFilter = {
  agentId?: string;
  handle?: string;
  status?: "active" | "revoked";
};

export function listVirtualWalletsEffect(
  env: NodeJS.ProcessEnv,
  filter?: ListVirtualWalletsFilter
): Effect.Effect<CloudflareVirtualWalletRecord[], CloudflareWalletStoreError> {
  return Effect.gen(function* () {
    const file = yield* loadFileEffect(env);
    return Object.values(file.wallets).filter((w) => {
      if (filter?.agentId && w.agentId !== filter.agentId) return false;
      if (filter?.handle && w.handle !== filter.handle) return false;
      if (filter?.status && w.status !== filter.status) return false;
      return true;
    });
  });
}

/** Promise façade for legacy callers. */
export async function upsertVirtualWallet(
  env: NodeJS.ProcessEnv,
  record: CloudflareVirtualWalletRecord
): Promise<CloudflareVirtualWalletRecord> {
  return Effect.runPromise(upsertVirtualWalletEffect(env, record));
}

/** Promise façade for legacy callers. */
export async function getVirtualWallet(
  env: NodeJS.ProcessEnv,
  walletId: string
): Promise<CloudflareVirtualWalletRecord | undefined> {
  return Effect.runPromise(getVirtualWalletEffect(env, walletId));
}

/** Promise façade for legacy callers. */
export async function listVirtualWallets(
  env: NodeJS.ProcessEnv,
  filter?: ListVirtualWalletsFilter
): Promise<CloudflareVirtualWalletRecord[]> {
  return Effect.runPromise(listVirtualWalletsEffect(env, filter));
}

/** Effect surface over the Cloudflare virtual wallet JSON store. */
export class CloudflareWalletStoreService extends Context.Service<
  CloudflareWalletStoreService,
  {
    readonly upsert: (
      record: CloudflareVirtualWalletRecord
    ) => Effect.Effect<CloudflareVirtualWalletRecord, CloudflareWalletStoreError>;
    readonly get: (
      walletId: string
    ) => Effect.Effect<CloudflareVirtualWalletRecord | undefined, CloudflareWalletStoreError>;
    readonly list: (
      filter?: ListVirtualWalletsFilter
    ) => Effect.Effect<CloudflareVirtualWalletRecord[], CloudflareWalletStoreError>;
  }
>()("clawql/CloudflareWalletStoreService") {}

export function cloudflareWalletStoreLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<CloudflareWalletStoreService> {
  return Layer.succeed(
    CloudflareWalletStoreService,
    CloudflareWalletStoreService.of({
      upsert: (record) => upsertVirtualWalletEffect(env, record),
      get: (walletId) => getVirtualWalletEffect(env, walletId),
      list: (filter) => listVirtualWalletsEffect(env, filter),
    })
  );
}

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  loadResolvedHomeSyncConfig,
  parseSyncProvider,
  writeSyncConfigFile,
  readSyncConfigFile,
} from "../home-sync/config.js";
import { getClawqlHome } from "./paths.js";
import type { HomeSyncConfigFile, SyncProvider } from "../home-sync/types.js";
import {
  formatSyncResult,
  formatSyncStatus,
  runSyncPull,
  runSyncPush,
  runSyncStatus,
} from "../home-sync/engine.js";
import { getSyncConfigPath } from "../home-sync/paths.js";

export type SyncInitOptions = {
  home?: string;
  interactive?: boolean;
  provider?: SyncProvider;
  bucket?: string;
  prefix?: string;
  yes?: boolean;
};

async function prompt(question: string, def?: string): Promise<string> {
  if (!process.stdin.isTTY) return def ?? "";
  const rl = readline.createInterface({ input, output });
  try {
    const suffix = def ? ` [${def}]` : "";
    const ans = (await rl.question(`${question}${suffix}: `)).trim();
    return ans || def || "";
  } finally {
    rl.close();
  }
}

export async function runSyncInit(opts: SyncInitOptions): Promise<number> {
  const home = opts.home ?? getClawqlHome();
  const existing = await readSyncConfigFile(getSyncConfigPath(home));
  if (existing && !opts.yes && !opts.interactive) {
    console.error(`Sync already configured at ${getSyncConfigPath(home)} — use --yes to overwrite`);
    return 1;
  }

  let provider: SyncProvider = opts.provider ?? existing?.provider ?? "r2";
  let bucket = opts.bucket ?? existing?.bucket ?? "";
  let prefix = opts.prefix ?? existing?.prefix ?? "";

  if (opts.interactive) {
    const p = await prompt("Provider (r2|s3|gcs)", provider);
    provider = parseSyncProvider(p || provider);
    bucket = await prompt("Bucket name", bucket);
    prefix = await prompt("Team prefix (e.g. teams/acme/)", prefix);
  }

  if (!bucket.trim()) {
    console.error("Bucket name is required");
    return 1;
  }

  const config: HomeSyncConfigFile = {
    version: 1,
    provider,
    bucket: bucket.trim(),
    prefix: prefix.trim() || undefined,
  };
  await writeSyncConfigFile(config, getSyncConfigPath(home));

  console.log("Team sync configured\n");
  console.log(`  Config:   ${getSyncConfigPath(home)}`);
  console.log(`  Provider: ${provider} (default: r2 — Cloudflare R2)`);
  console.log(`  Bucket:   ${config.bucket}`);
  if (config.prefix) console.log(`  Prefix:   ${config.prefix}`);
  console.log("\nCredentials (not stored in sync.json):");
  if (provider === "r2") {
    console.log("  CLAWQL_R2_ACCOUNT_ID          Cloudflare account id");
    console.log("  CLAWQL_SYNC_ACCESS_KEY_ID   R2 S3 API access key");
    console.log("  CLAWQL_SYNC_SECRET_ACCESS_KEY R2 S3 API secret");
    console.log("  Or store r2AccessKeyId / r2SecretAccessKey / cloudflareAccountId in vault");
  } else if (provider === "s3") {
    console.log("  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION");
  } else {
    console.log("  GCS HMAC keys + CLAWQL_SYNC_ENDPOINT=https://storage.googleapis.com");
  }
  console.log("\nNext:");
  console.log("  clawql sync push    Upload Memory/ + sources to the team bucket");
  console.log("  clawql sync pull    Download team notes to this machine");
  console.log("  clawql sync status  Compare local vs remote\n");
  return 0;
}

export async function runSyncPushCmd(opts: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<number> {
  try {
    await loadResolvedHomeSyncConfig();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    console.error("Run: clawql sync init");
    return 1;
  }
  const result = await runSyncPush(opts);
  console.log(formatSyncResult(result, "push"));
  return result.conflicts && !opts.force ? 2 : 0;
}

export async function runSyncPullCmd(opts: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<number> {
  try {
    await loadResolvedHomeSyncConfig();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    console.error("Run: clawql sync init");
    return 1;
  }
  const result = await runSyncPull(opts);
  console.log(formatSyncResult(result, "pull"));
  if (result.downloaded > 0 && !result.dryRun) {
    console.log("\nTip: run `clawql doctor` or memory_recall to refresh memory.db after pull.");
  }
  return result.conflicts && !opts.force ? 2 : 0;
}

export async function runSyncStatusCmd(): Promise<number> {
  try {
    const status = await runSyncStatus();
    console.log(formatSyncStatus(status));
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

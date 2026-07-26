import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  loadResolvedHomeSyncConfig,
  parseSyncProvider,
  writeSyncConfigFile,
  readSyncConfigFile,
} from "../home-sync/config.js";
import {
  DEFAULT_SYNC_BUCKET,
  DEFAULT_SYNC_PREFIX,
  ensureSyncBucket,
} from "../home-sync/ensure-bucket.js";
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
import { printSyncCredentialHelp, syncProviderLabel } from "./sync-credential-help.js";

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
    const p = await prompt("Provider (r2|s3|gcs|gcp)", provider);
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
  console.log(`  Provider: ${provider} — ${syncProviderLabel(provider)}`);
  console.log(`  Bucket:   ${config.bucket}`);
  if (config.prefix) console.log(`  Prefix:   ${config.prefix}`);
  printSyncCredentialHelp(provider);
  console.log("\nNext:");
  console.log("  clawql sync push    Upload Memory/ + sources to the team bucket");
  console.log("  clawql sync pull    Download team notes to this machine");
  console.log("  clawql sync status  Compare local vs remote\n");
  return 0;
}

export async function runSyncPushCmd(opts: { dryRun?: boolean; force?: boolean }): Promise<number> {
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

export async function runSyncPullCmd(opts: { dryRun?: boolean; force?: boolean }): Promise<number> {
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

export type SyncEnsureOptions = {
  home?: string;
  interactive?: boolean;
  provider?: SyncProvider;
  bucket?: string;
  prefix?: string;
  location?: string;
  dryRun?: boolean;
  yes?: boolean;
};

export async function runSyncEnsure(opts: SyncEnsureOptions): Promise<number> {
  const home = opts.home ?? getClawqlHome();
  let provider: SyncProvider = opts.provider ?? "r2";
  let bucket = opts.bucket ?? "";
  let prefix = opts.prefix ?? "";
  let location = opts.location ?? "";

  if (opts.interactive) {
    const p = await prompt("Provider (r2|s3)", provider);
    provider = parseSyncProvider(p || provider);
    bucket = await prompt(
      `Bucket name (default ${DEFAULT_SYNC_BUCKET})`,
      bucket || DEFAULT_SYNC_BUCKET
    );
    prefix = await prompt(
      `Team prefix (default ${DEFAULT_SYNC_PREFIX})`,
      prefix || DEFAULT_SYNC_PREFIX
    );
    if (provider === "r2") {
      location = await prompt("R2 location hint (e.g. weur)", location || "weur");
    }
  }

  try {
    const result = await ensureSyncBucket({
      home,
      provider,
      bucket: bucket || undefined,
      prefix: prefix || undefined,
      location: location || undefined,
      dryRun: opts.dryRun,
    });
    console.log(opts.dryRun ? "Team sync ensure (dry-run)\n" : "Team sync ensured\n");
    console.log(`  Config:   ${result.configPath}`);
    console.log(`  Provider: ${result.provider} — ${syncProviderLabel(result.provider)}`);
    console.log(`  Bucket:   ${result.bucket}`);
    console.log(`  Prefix:   ${result.prefix}`);
    console.log(
      `  Status:   ${result.created ? "created" : "already exists"} via ${result.method}`
    );
    if (!opts.dryRun) {
      printSyncCredentialHelp(result.provider);
      console.log("\nNext:");
      console.log("  clawql sync push    Upload Memory/ + sources to the team bucket");
      console.log("  clawql sync pull    Download team notes to this machine");
      console.log("  clawql sync status  Compare local vs remote\n");
    }
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

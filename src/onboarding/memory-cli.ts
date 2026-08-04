/**
 * `clawql memory` — thin wrapper over clawql-memory OKF vault ops.
 */

import { resolve } from "node:path";
import {
  lintVaultOkf,
  migrateVaultToOkfV02,
  queryVaultOkf,
  type VaultOpsOptions,
} from "clawql-memory/okf";

export type MemoryCliOptions = {
  vault?: string;
  scanRoot?: string;
  dryRun?: boolean;
  json?: boolean;
  checkStale?: boolean;
  requireWormRef?: boolean;
  openPrs?: boolean;
  filter?: string;
  okfVersion?: string;
};

function toOps(opts: MemoryCliOptions): VaultOpsOptions {
  return {
    vault: opts.vault?.trim() ? resolve(opts.vault.trim()) : undefined,
    scanRoot: opts.scanRoot,
    dryRun: opts.dryRun,
    json: opts.json,
    checkStale: opts.checkStale !== false,
    requireWormRef: opts.requireWormRef,
    openPrs: opts.openPrs,
    filter: opts.filter,
    okfVersion: opts.okfVersion ?? "0.2",
  };
}

export async function runMemoryLint(opts: MemoryCliOptions): Promise<number> {
  const result = await lintVaultOkf(toOps(opts));
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `memory lint: ${result.scanned} file(s), ${result.issues.length} issue(s), ${result.stalePaths.length} stale`
    );
    for (const issue of result.issues) {
      console.log(
        `${issue.severity.toUpperCase()} ${issue.path ?? "?"}: [${issue.code}] ${issue.message}`
      );
    }
    if (result.openPrBodies?.length) {
      console.log(`\n--open-prs: ${result.openPrBodies.length} suggested review PR(s)`);
      for (const pr of result.openPrBodies) {
        console.log(`---\n# ${pr.title}\n${pr.body}\n`);
      }
    }
    console.log(result.ok ? "OK" : "FAILED");
  }
  return result.ok ? 0 : 1;
}

export async function runMemoryMigrate(opts: MemoryCliOptions): Promise<number> {
  const result = await migrateVaultToOkfV02(toOps(opts));
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `memory migrate okf ${opts.okfVersion ?? "0.2"}: scanned ${result.scanned}, migrated ${result.migrated}, unchanged ${result.unchanged}${result.dryRun ? " (dry-run)" : ""}`
    );
  }
  return 0;
}

export async function runMemoryQuery(opts: MemoryCliOptions): Promise<number> {
  if (!opts.filter?.trim()) {
    console.error(
      "Usage: clawql memory query --filter 'verified.by != human AND type == decision'"
    );
    return 1;
  }
  const result = await queryVaultOkf(toOps(opts));
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`memory query: ${result.count} match(es)`);
    for (const row of result.rows) {
      console.log(
        `${row.path}\ttype=${row.type ?? ""}\tstatus=${row.status ?? ""}\tverified.by=${row.verifiedBy ?? ""}`
      );
    }
  }
  return 0;
}

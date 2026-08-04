/**
 * clawql-memory — OKF vault CLI (lint / migrate / query)
 */
import { resolve } from "node:path";
import {
  lintVaultOkf,
  migrateVaultToOkfV02,
  queryVaultOkf,
  type VaultOpsOptions,
} from "./okf/vault-ops.js";

function usage(): void {
  console.log(`clawql-memory — OKF v0.2 vault operations

Usage:
  clawql-memory lint [--vault DIR] [--check-stale] [--open-prs] [--require-worm-ref] [--json]
  clawql-memory migrate --okf-version 0.2 [--vault DIR] [--dry-run] [--json]
  clawql-memory query --filter 'verified.by != human AND type == decision' [--vault DIR] [--json]

Defaults:
  Vault: CLAWQL_OBSIDIAN_VAULT_PATH or --vault
  Scan root: CLAWQL_MEMORY_RECALL_SCAN_ROOT (default Memory/)
`);
}

function parseArgs(argv: string[]): {
  cmd: string;
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--vault") flags.vault = argv[++i] ?? "";
    else if (a === "--dir") flags.vault = argv[++i] ?? "";
    else if (a === "--okf-version") flags.okfVersion = argv[++i] ?? "";
    else if (a === "--filter") flags.filter = argv[++i] ?? "";
    else if (a === "--scan-root") flags.scanRoot = argv[++i] ?? "";
    else if (a === "--check-stale") flags.checkStale = true;
    else if (a === "--no-check-stale") flags.checkStale = false;
    else if (a === "--open-prs") flags.openPrs = true;
    else if (a === "--require-worm-ref") flags.requireWormRef = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (!a.startsWith("-")) positional.push(a);
  }
  return { cmd: positional[0] ?? "help", flags, positional: positional.slice(1) };
}

function optsFromFlags(flags: Record<string, string | boolean>): VaultOpsOptions {
  return {
    vault:
      typeof flags.vault === "string" && flags.vault.trim()
        ? resolve(flags.vault.trim())
        : undefined,
    scanRoot: typeof flags.scanRoot === "string" ? flags.scanRoot : undefined,
    dryRun: Boolean(flags.dryRun),
    json: Boolean(flags.json),
    checkStale: flags.checkStale === false ? false : true,
    requireWormRef: Boolean(flags.requireWormRef),
    openPrs: Boolean(flags.openPrs),
    filter: typeof flags.filter === "string" ? flags.filter : undefined,
    okfVersion: typeof flags.okfVersion === "string" ? flags.okfVersion : "0.2",
  };
}

async function main(argv: string[]): Promise<number> {
  const { cmd, flags } = parseArgs(argv);
  if (flags.help || cmd === "help") {
    usage();
    return 0;
  }
  const opts = optsFromFlags(flags);

  if (cmd === "lint") {
    const result = await lintVaultOkf(opts);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `memory lint: ${result.scanned} file(s), ${result.issues.length} issue(s), ${result.stalePaths.length} stale`
      );
      for (const issue of result.issues) {
        const loc = issue.path ?? "(unknown)";
        console.log(`${issue.severity.toUpperCase()} ${loc}: [${issue.code}] ${issue.message}`);
      }
      if (result.openPrBodies?.length) {
        console.log(`\n--open-prs: ${result.openPrBodies.length} suggested review PR(s):`);
        for (const pr of result.openPrBodies) {
          console.log(`---\n# ${pr.title}\n${pr.body}\n`);
        }
      }
      console.log(result.ok ? "OK" : "FAILED");
    }
    return result.ok ? 0 : 1;
  }

  if (cmd === "migrate") {
    const result = await migrateVaultToOkfV02(opts);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `memory migrate okf ${opts.okfVersion ?? "0.2"}: scanned ${result.scanned}, migrated ${result.migrated}, unchanged ${result.unchanged}${result.dryRun ? " (dry-run)" : ""}`
      );
      for (const f of result.files.slice(0, 50)) console.log(`  ${f}`);
      if (result.files.length > 50) console.log(`  … +${result.files.length - 50} more`);
    }
    return 0;
  }

  if (cmd === "query") {
    if (!opts.filter?.trim()) {
      console.error("Usage: clawql-memory query --filter 'type == decision'");
      return 1;
    }
    const result = await queryVaultOkf(opts);
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

  usage();
  return 1;
}

const isDirect =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("cli.js") ||
    process.argv[1].endsWith("cli.cjs") ||
    process.argv[1].includes("clawql-memory"));

if (isDirect) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    });
}

export { main as runClawqlMemoryCli };

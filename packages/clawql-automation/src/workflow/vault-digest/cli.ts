#!/usr/bin/env node
/**
 * CLI entry for Argo / CronWorkflow vault digest step.
 * Usage: node dist/workflow/vault-digest/cli.js [--hours 24]
 */

import { runVaultDailyDigest } from "./run-vault-digest.js";

function parseHours(argv: string[]): number {
  const idx = argv.indexOf("--hours");
  if (idx !== -1 && argv[idx + 1]) {
    const n = Number.parseInt(argv[idx + 1]!, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const env = process.env.CLAWQL_VAULT_DIGEST_HOURS?.trim();
  if (env) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 24;
}

async function main(): Promise<void> {
  const hoursBack = parseHours(process.argv.slice(2));
  const result = await runVaultDailyDigest({ hoursBack });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
    return;
  }
  if (result.skipped) {
    process.exitCode = 0;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

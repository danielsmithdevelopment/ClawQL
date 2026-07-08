#!/usr/bin/env node
/**
 * ClawQL onboarding CLI: init, doctor, mcp-config.
 */
import "../load-env.js";
import { formatDoctorReport, runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { formatMcpConfig } from "./mcp-config.js";

type Command = "init" | "doctor" | "mcp-config" | "help";

function parse(argv: string[]): { cmd: Command; flags: Record<string, string | boolean> } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a === "--interactive" || a === "-i") flags.interactive = true;
    else if (a === "--verbose" || a === "-v") flags.verbose = true;
    else if (a === "--push-vault") flags.pushVault = true;
    else if (a === "--http") flags.http = true;
    else if (a === "--from-env") flags.fromEnv = argv[++i] ?? ".env";
    else if (a === "--home") flags.home = argv[++i] ?? "";
    else if (a === "--url") flags.url = argv[++i] ?? "";
    else if (!a.startsWith("-")) positional.push(a);
  }
  const cmd = (positional[0] ?? "help") as Command;
  return { cmd, flags };
}

function printHelp(): void {
  console.log(`ClawQL onboarding — vault-first setup (better than copying tokens into mcp.json)

Usage:
  clawql init [--yes] [--interactive] [--from-env .env] [--push-vault] [--home DIR]
  clawql doctor [--verbose]
  clawql mcp-config [--http] [--url http://host/mcp]

init:
  Creates ~/.ClawQL (Memory/, Dashboard/, vault/providers.json, clawql.env).
  Provider API keys go in vault/providers.json (mode 0600) — same shape as HashiCorp secret/clawql/providers.
  Sets CLAWQL_OBSIDIAN_VAULT_PATH so memory_ingest / memory_recall work out of the box.

  --interactive   Prompt for default-stack tokens (GitHub, Slack, Linear, Notion, Onyx, Cloudflare)
  --from-env      Import recognized keys from a .env file into the local vault
  --push-vault    When VAULT_TOKEN is set, sync to HashiCorp Vault (K8s / Helm path)

doctor:
  Node, ClawQL home, memory vault, provider secrets coverage, optional HTTP /healthz

mcp-config:
  Print MCP JSON for Cursor / Claude (stdio — secrets loaded from vault at server startup)

Docs: https://docs.clawql.com/agent-setup
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const { cmd, flags } = parse(argv);

  if (cmd === "help") {
    printHelp();
    return;
  }

  if (cmd === "init") {
    const result = await runInit({
      yes: Boolean(flags.yes),
      interactive: Boolean(flags.interactive),
      fromEnv: typeof flags.fromEnv === "string" ? flags.fromEnv : undefined,
      pushVault: Boolean(flags.pushVault),
      home: typeof flags.home === "string" && flags.home ? flags.home : undefined,
    });
    console.log("ClawQL init complete\n");
    console.log(`  Home:     ${result.home}`);
    console.log(`  Memory:   ${result.home}/Memory/`);
    console.log(`  Secrets:  ${result.providersVault}`);
    console.log(`  Config:   ${result.envFile}`);
    if (result.providerKeys.length) {
      console.log(`  Keys:     ${result.providerKeys.join(", ")}`);
    }
    if (result.pushedToHashicorpVault) {
      console.log("  Vault:    synced to HashiCorp secret/clawql/providers");
    }
    console.log("\nNext:");
    console.log("  npx clawql doctor");
    console.log("  npx clawql mcp-config  → paste into Cursor MCP settings");
    console.log("  Restart your MCP client after config changes.\n");
    return;
  }

  if (cmd === "doctor") {
    const report = await runDoctor(Boolean(flags.verbose));
    console.log(formatDoctorReport(report, Boolean(flags.verbose)));
    const failed = report.checks.some((c) => c.level === "fail");
    process.exitCode = failed ? 1 : 0;
    return;
  }

  if (cmd === "mcp-config") {
    process.stdout.write(
      formatMcpConfig({
        transport: flags.http ? "http" : "stdio",
        url: typeof flags.url === "string" ? flags.url : undefined,
      }),
    );
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("[clawql]", err instanceof Error ? err.message : err);
  process.exit(1);
});

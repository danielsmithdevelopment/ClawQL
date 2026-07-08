#!/usr/bin/env node
/**
 * ClawQL onboarding CLI: init, doctor, mcp-config, secrets.
 */
import "../load-env.js";
import { formatDoctorReport, runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { formatMcpConfig } from "./mcp-config.js";
import { writeMcpConfigFile, type McpWriteTarget } from "./mcp-config-write.js";
import { runSecretsList, runSecretsSet } from "./secrets-cli.js";

type Command = "init" | "doctor" | "mcp-config" | "secrets" | "help";

function parse(argv: string[]): {
  cmd: Command;
  subcmd?: string;
  flags: Record<string, string | boolean>;
  rest: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--yes" || a === "-y") flags.yes = true;
    else if (a === "--interactive" || a === "-i") flags.interactive = true;
    else if (a === "--verbose" || a === "-v") flags.verbose = true;
    else if (a === "--smoke") flags.smoke = true;
    else if (a === "--push-vault") flags.pushVault = true;
    else if (a === "--http") flags.http = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--from-env") flags.fromEnv = argv[++i] ?? ".env";
    else if (a === "--home") flags.home = argv[++i] ?? "";
    else if (a === "--url") flags.url = argv[++i] ?? "";
    else if (a === "--write") flags.write = argv[++i] ?? "";
    else if (a.startsWith("--write=")) flags.write = a.slice("--write=".length);
    else if (a.startsWith("--write-mcp=")) flags.writeMcp = a.slice("--write-mcp=".length);
    else if (!a.startsWith("-")) positional.push(a);
  }
  const cmd = (positional[0] ?? "help") as Command;
  const subcmd = cmd === "secrets" ? positional[1] : undefined;
  const rest = cmd === "secrets" ? positional.slice(2) : positional.slice(1);
  return { cmd, subcmd, flags, rest };
}

function parseWriteTarget(raw: string | boolean | undefined): McpWriteTarget | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  if (raw === "cursor" || raw === "claude-desktop") return raw;
  throw new Error(`--write must be cursor or claude-desktop (got: ${raw})`);
}

function printHelp(): void {
  console.log(`ClawQL onboarding — vault-first setup (better than copying tokens into mcp.json)

Usage:
  clawql init [--yes] [--interactive] [--from-env .env] [--push-vault] [--write-mcp=cursor] [--home DIR]
  clawql doctor [--verbose] [--smoke]
  clawql secrets list
  clawql secrets set <github|slack|linear|…> [value]
  clawql mcp-config [--json] [--write cursor|claude-desktop] [--http] [--url http://host/mcp]

init:
  Creates ~/.ClawQL (Memory/, Dashboard/, vault/providers.json, clawql.env).
  Provider API keys go in vault/providers.json (mode 0600) — same shape as HashiCorp secret/clawql/providers.
  Sets CLAWQL_OBSIDIAN_VAULT_PATH so memory_ingest / memory_recall work out of the box.

  --interactive   Prompt for default-stack tokens (hidden input on Unix TTY)
  --from-env      Import recognized keys from a .env file into the local vault
  --push-vault    When VAULT_TOKEN is set, sync to HashiCorp Vault (K8s / Helm path)
  --write-mcp     Write MCP config for cursor or claude-desktop (with .bak backup)

doctor:
  Node, ClawQL home, memory vault, provider secrets, optional Vault probe, HTTP /healthz
  --smoke         Spawn MCP stdio and run tools/list + search (+ execute when secrets exist)

secrets:
  list            Show configured provider keys (masked)
  set             Set one key in vault/providers.json (prompts if value omitted)

mcp-config:
  Print or write MCP JSON for Cursor / Claude (stdio — secrets loaded from vault at server startup)

Docs: https://docs.clawql.com/agent-setup
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const { cmd, subcmd, flags, rest } = parse(argv);

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
      writeMcp: parseWriteTarget(flags.writeMcp),
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
    console.log("  npx clawql doctor --smoke");
    console.log("  npx clawql mcp-config --write cursor");
    console.log("  Restart your MCP client after config changes.\n");
    return;
  }

  if (cmd === "doctor") {
    const report = await runDoctor(Boolean(flags.verbose), { smoke: Boolean(flags.smoke) });
    console.log(formatDoctorReport(report, Boolean(flags.verbose)));
    const failed = report.checks.some((c) => c.level === "fail");
    process.exitCode = failed ? 1 : 0;
    return;
  }

  if (cmd === "secrets") {
    if (subcmd === "list") {
      process.exitCode = await runSecretsList();
      return;
    }
    if (subcmd === "set") {
      process.exitCode = await runSecretsSet(rest);
      return;
    }
    console.error("Usage: clawql secrets list | clawql secrets set <provider> [value]");
    process.exitCode = 1;
    return;
  }

  if (cmd === "mcp-config") {
    const writeTarget = parseWriteTarget(flags.write);
    if (writeTarget) {
      const wr = await writeMcpConfigFile(writeTarget, {
        transport: flags.http ? "http" : "stdio",
        url: typeof flags.url === "string" ? flags.url : undefined,
      });
      console.log(
        `MCP config ${wr.created ? "created" : "updated"}: ${wr.path}` +
          (wr.backupPath ? `\nBackup: ${wr.backupPath}` : "")
      );
      return;
    }
    process.stdout.write(
      formatMcpConfig({
        transport: flags.http ? "http" : "stdio",
        url: typeof flags.url === "string" ? flags.url : undefined,
      })
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

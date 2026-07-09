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
import { onboardExitCode, runOnboard } from "./onboard.js";
import { runOperatorStatus } from "./operator-cli.js";
import { runSourcesAdd, runSourcesList, runSourcesRemove } from "./sources-cli.js";
import { runHarness, type HarnessId } from "./harness-cli.js";
import {
  parseImageDigestFlags,
  runReleaseCollect,
  runReleaseInit,
  runReleaseManifest,
  runReleasePublish,
  runReleaseVerify,
} from "./release-cli.js";

type Command =
  | "init"
  | "doctor"
  | "mcp-config"
  | "secrets"
  | "onboard"
  | "operator"
  | "sources"
  | "release"
  | "claude"
  | "codex"
  | "cursor"
  | "opencode"
  | "install"
  | "help";

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
    else if (a === "--skip-smoke") flags.skipSmoke = true;
    else if (a === "--skip-mcp-write") flags.skipMcpWrite = true;
    else if (a === "--name") flags.name = argv[++i] ?? "";
    else if (a === "--kind") flags.kind = argv[++i] ?? "";
    else if (a === "--id") flags.id = argv[++i] ?? "";
    else if (a === "--command") flags.command = argv[++i] ?? "";
    else if (a === "--args") flags.args = argv[++i] ?? "";
    else if (a === "--tag") flags.tag = argv[++i] ?? "";
    else if (a === "--sbom") flags.sbom = argv[++i] ?? "";
    else if (a === "--npm-tgz") flags.npmTgz = argv[++i] ?? "";
    else if (a === "--github") flags.github = true;
    else if (a === "--no-copy") flags.noCopy = true;
    else if (a.startsWith("--image-digest=")) {
      const prev = typeof flags.imageDigest === "string" ? flags.imageDigest : "";
      flags.imageDigest = prev
        ? `${prev},${a.slice("--image-digest=".length)}`
        : a.slice("--image-digest=".length);
    } else if (a === "--image-digest") {
      const v = argv[++i] ?? "";
      const prev = typeof flags.imageDigest === "string" ? flags.imageDigest : "";
      flags.imageDigest = prev ? `${prev},${v}` : v;
    } else if (!a.startsWith("-")) positional.push(a);
  }
  const cmd = (positional[0] ?? "help") as Command;
  const subcmd =
    cmd === "secrets" || cmd === "operator" || cmd === "sources" || cmd === "release"
      ? positional[1]
      : undefined;
  const rest =
    cmd === "secrets" || cmd === "operator" || cmd === "sources"
      ? positional.slice(2)
      : cmd === "release"
        ? positional.slice(2)
        : positional.slice(1);
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
  clawql onboard [--yes] [--interactive] [--from-env .env] [--write-mcp=cursor] [--skip-smoke] [--skip-mcp-write]
  clawql init [--yes] [--interactive] [--from-env .env] [--push-vault] [--write-mcp=cursor] [--home DIR]
  clawql doctor [--verbose] [--smoke]
  clawql secrets list
  clawql secrets set <github|slack|linear|…> [value]
  clawql mcp-config [--json] [--write cursor|claude-desktop] [--http] [--url http://host/mcp]
  clawql sources list | add <url> [--name NAME] [--kind openapi|discovery|graphql|grpc|mcp|cli] | remove <id>
  clawql sources add --kind cli --command <bin> [--args a,b] [--name NAME]
  clawql release init | collect | manifest | publish | verify <path>
  clawql claude | codex | cursor | opencode [-- harness args...]
  clawql operator status

Harness (MCP pre-wired):
  clawql claude     Claude Code / Claude Desktop MCP config + launch claude on PATH
  clawql codex      ~/.codex/config.toml + launch codex
  clawql cursor     ~/.cursor/mcp.json + launch cursor
  clawql opencode   ~/.config/opencode/opencode.json + launch opencode

Install (local script):
  curl -fsSL https://clawql.com/install | bash

release (Layer 0 MVP — immutable manifest):
  init            Write .clawql/release.json
  collect         Print manifest JSON (git commit, SBOM, npm tgz, image digests)
  manifest        Write releases/vX.Y.Z/manifest.json
  publish         manifest + optional --github (needs gh CLI)
  verify <path>   Verify bundle directory or manifest.json

operator:
  status          List ClawQLInstance CRs and tier-spec ConfigMaps (requires kubeconfig)

onboard:
  End-to-end first run: init → write MCP config (cursor) → doctor --smoke
  Same flags as init plus --skip-smoke and --skip-mcp-write

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

  if (cmd === "onboard") {
    const writeMcp = flags.skipMcpWrite ? false : parseWriteTarget(flags.writeMcp ?? "cursor");
    const result = await runOnboard({
      yes: Boolean(flags.yes),
      interactive: Boolean(flags.interactive),
      fromEnv: typeof flags.fromEnv === "string" ? flags.fromEnv : undefined,
      pushVault: Boolean(flags.pushVault),
      home: typeof flags.home === "string" && flags.home ? flags.home : undefined,
      writeMcp,
      smoke: !flags.skipSmoke,
      json: Boolean(flags.json),
    });
    process.exitCode = onboardExitCode(result);
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

  if (cmd === "operator") {
    if (subcmd === "status") {
      process.exitCode = await runOperatorStatus();
      return;
    }
    console.error("Usage: clawql operator status");
    process.exitCode = 1;
    return;
  }

  if (cmd === "sources") {
    const home = typeof flags.home === "string" && flags.home ? flags.home : undefined;
    if (subcmd === "list") {
      process.exitCode = await runSourcesList(home);
      return;
    }
    if (subcmd === "remove") {
      const id = rest[0];
      if (!id) {
        console.error("Usage: clawql sources remove <id>");
        process.exitCode = 1;
        return;
      }
      process.exitCode = await runSourcesRemove(id, home);
      return;
    }
    if (subcmd === "add") {
      const url = rest[0];
      const argsList =
        typeof flags.args === "string" && flags.args
          ? flags.args
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      process.exitCode = await runSourcesAdd({
        url,
        name: typeof flags.name === "string" ? flags.name : undefined,
        kind: typeof flags.kind === "string" ? (flags.kind as never) : undefined,
        id: typeof flags.id === "string" ? flags.id : undefined,
        command: typeof flags.command === "string" ? flags.command : undefined,
        args: argsList,
        home,
      });
      return;
    }
    console.error(
      "Usage: clawql sources list | clawql sources add <url> | clawql sources remove <id>"
    );
    process.exitCode = 1;
    return;
  }

  if (cmd === "release") {
    const releaseOpts = {
      root: typeof flags.home === "string" && flags.home ? flags.home : undefined,
      tag: typeof flags.tag === "string" && flags.tag ? flags.tag : undefined,
      sbom: typeof flags.sbom === "string" ? flags.sbom : undefined,
      npmTgz: typeof flags.npmTgz === "string" ? flags.npmTgz : undefined,
      imageDigests:
        typeof flags.imageDigest === "string" && flags.imageDigest
          ? parseImageDigestFlags(flags.imageDigest.split(","))
          : undefined,
      github: Boolean(flags.github),
      noCopy: Boolean(flags.noCopy),
      json: Boolean(flags.json),
    };
    if (subcmd === "init") {
      process.exitCode = await runReleaseInit(releaseOpts);
      return;
    }
    if (subcmd === "collect") {
      process.exitCode = await runReleaseCollect(releaseOpts);
      return;
    }
    if (subcmd === "manifest") {
      process.exitCode = await runReleaseManifest(releaseOpts);
      return;
    }
    if (subcmd === "publish") {
      process.exitCode = await runReleasePublish(releaseOpts);
      return;
    }
    if (subcmd === "verify") {
      const target = rest[0];
      if (!target) {
        console.error("Usage: clawql release verify <bundle-dir|manifest.json>");
        process.exitCode = 1;
        return;
      }
      process.exitCode = await runReleaseVerify(target);
      return;
    }
    console.error("Usage: clawql release init | collect | manifest | publish | verify <path>");
    process.exitCode = 1;
    return;
  }

  const harnessIds: HarnessId[] = ["claude", "codex", "cursor", "opencode"];
  if (harnessIds.includes(cmd as HarnessId)) {
    const dash = argv.indexOf("--");
    const forwarded = dash >= 0 ? argv.slice(dash + 1) : rest;
    process.exitCode = await runHarness(cmd as HarnessId, forwarded);
    return;
  }

  if (cmd === "install") {
    console.log("Run: curl -fsSL https://clawql.com/install | bash");
    console.log("Or: npm install -g clawql-mcp && clawql onboard");
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

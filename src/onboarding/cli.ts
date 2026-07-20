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
import { runSyncInit, runSyncPullCmd, runSyncPushCmd, runSyncStatusCmd } from "./sync-cli.js";
import {
  runSandboxEditCmd,
  runSandboxInitCmd,
  runSandboxStatusCmd,
  runSandboxVerifyCmd,
} from "./sandbox-cli.js";
import {
  runInferenceCacheStatusCmd,
  runInferenceFallbackShowCmd,
  runInferenceKeysCreateCmd,
  runInferenceKeysListCmd,
  runInferenceKeysRevokeCmd,
  runInferencePolicyShowCmd,
  runInferencePipelineWorkerCmd,
  runInferenceCompleteCmd,
  runInferenceEscalationSetTierCmd,
  runInferenceEscalationShowCmd,
  runInferenceExportCmd,
  runInferenceFinetuneCmd,
  runInferenceFinetuneRegisterCmd,
  runInferenceFinetuneStatusCmd,
  runInferenceLogsCmd,
  runInferencePipelineDisableCmd,
  runInferencePipelineEnableCmd,
  runInferencePipelineRunCmd,
  runInferencePipelineStatusCmd,
  runInferenceServeCmd,
  runInferenceSpendCmd,
  runInferenceTraceCmd,
  type InferenceCliOptions,
} from "./inference-cli.js";
import {
  runPaymentsAuditCmd,
  runPaymentsAuditVerifyCmd,
  runPaymentsPlanShowCmd,
  runPaymentsPlanUpgradeCmd,
  runPaymentsSpendReportCmd,
  runPaymentsStripeCustomerCreateCmd,
  runPaymentsStripeInvoiceCreateCmd,
  runPaymentsStripeSetupCmd,
  runPaymentsStripeSubscriptionCreateCmd,
  runPaymentsStripeWebhookListenCmd,
  runPaymentsStripeWebhookVerifyCmd,
  runPaymentsStripeMeterReportCmd,
  runPaymentsUsageReportCmd,
  runPaymentsX402GateCmd,
  runPaymentsX402GateListCmd,
  runPaymentsX402ReconcileCmd,
  runPaymentsX402VerifyCmd,
  runPaymentsX402WalletSetupCmd,
  runPaymentsPayoutConnectCreateCmd,
  runPaymentsPayoutConnectLinkCmd,
  runPaymentsPayoutCreateCmd,
  runPaymentsPayoutPreferCmd,
  runPaymentsRampFundCreateCmd,
  runPaymentsRampCardIssueCmd,
  runPaymentsRampAgentCardIssueCmd,
  runPaymentsOfframpSessionCmd,
  runPaymentsOfframpWebhookCmd,
  runPaymentsCreditsShowCmd,
  runPaymentsCreditsBankLinkCmd,
  runPaymentsCreditsTopupCmd,
  type PaymentsCliOptions,
} from "./payments-cli.js";
import { runOntologyGenerate, runOntologyLint } from "./ontology-cli.js";

type Command =
  | "init"
  | "doctor"
  | "mcp-config"
  | "secrets"
  | "onboard"
  | "operator"
  | "sources"
  | "release"
  | "ontology"
  | "sync"
  | "sandbox"
  | "inference"
  | "payments"
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
    else if (a === "--root") flags.root = argv[++i] ?? "";
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
    else if (a === "--dir") flags.dir = argv[++i] ?? "";
    else if (a === "--out") flags.out = argv[++i] ?? "";
    else if (a === "--schema") flags.schema = argv[++i] ?? "";
    else if (a === "--strict") flags.strict = true;
    else if (a === "--skip-lint") flags.skipLint = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--force") flags.force = true;
    else if (a === "--provider") flags.provider = argv[++i] ?? "";
    else if (a === "--bucket") flags.bucket = argv[++i] ?? "";
    else if (a === "--prefix") flags.prefix = argv[++i] ?? "";
    else if (a === "--path") flags.path = argv[++i] ?? "";
    else if (a === "--harness") flags.harness = argv[++i] ?? "";
    else if (a === "--port") flags.port = argv[++i] ?? "";
    else if (a === "--model") flags.model = argv[++i] ?? "";
    else if (a === "--message") flags.message = argv[++i] ?? "";
    else if (a === "--correlation-id") flags.correlationId = argv[++i] ?? "";
    else if (a === "--since") flags.since = argv[++i] ?? "";
    else if (a === "--limit") flags.limit = argv[++i] ?? "";
    else if (a === "--group-by") flags.groupBy = argv[++i] ?? "";
    else if (a === "--output") flags.output = argv[++i] ?? "";
    else if (a === "--format") flags.format = argv[++i] ?? "";
    else if (a === "--verdict") flags.verdict = argv[++i] ?? "";
    else if (a === "--min-score") flags.minScore = argv[++i] ?? "";
    else if (a === "--date-from") flags.dateFrom = argv[++i] ?? "";
    else if (a === "--date-to") flags.dateTo = argv[++i] ?? "";
    else if (a === "--max-latency-ms") flags.maxLatencyMs = argv[++i] ?? "";
    else if (a === "--min-token-efficiency") flags.minTokenEfficiency = argv[++i] ?? "";
    else if (a === "--exclude-cache-hits") flags.excludeCacheHits = true;
    else if (a === "--no-pii-scrub") flags.noPiiScrub = true;
    else if (a === "--write-manifest") flags.writeManifest = true;
    else if (a === "--no-write-manifest") flags.writeManifest = false;
    else if (a === "--dataset") flags.dataset = argv[++i] ?? "";
    else if (a === "--manifest") flags.manifest = argv[++i] ?? "";
    else if (a === "--base-model") flags.baseModel = argv[++i] ?? "";
    else if (a === "--register-as") flags.registerAs = argv[++i] ?? "";
    else if (a === "--job-id") flags.jobId = argv[++i] ?? "";
    else if (a === "--tier") flags.tier = argv[++i] ?? "";
    else if (a === "--alias") flags.alias = argv[++i] ?? "";
    else if (a === "--schedule") flags.schedule = argv[++i] ?? "";
    else if (a === "--min-samples") flags.minSamples = argv[++i] ?? "";
    else if (a === "--target-tier") flags.targetTier = argv[++i] ?? "";
    else if (a === "--evaluate-before-promote") flags.evaluateBeforePromote = true;
    else if (a === "--output-dir") flags.outputDir = argv[++i] ?? "";
    else if (a === "--team") flags.team = argv[++i] ?? "";
    else if (a === "--budget-usd") flags.budgetUsd = argv[++i] ?? "";
    else if (a === "--rate-limit") flags.rateLimit = argv[++i] ?? "";
    else if (a === "--email") flags.email = argv[++i] ?? "";
    else if (a === "--customer") flags.customer = argv[++i] ?? "";
    else if (a === "--plan") flags.plan = argv[++i] ?? "";
    else if (a === "--amount") flags.amount = argv[++i] ?? "";
    else if (a === "--payment-method") flags.paymentMethodId = argv[++i] ?? "";
    else if (a === "--return-url") flags.returnUrl = argv[++i] ?? "";
    else if (a === "--address") flags.address = argv[++i] ?? "";
    else if (a === "--asset") flags.asset = argv[++i] ?? "";
    else if (a === "--resource") flags.resource = argv[++i] ?? "";
    else if (a === "--tool") flags.tool = argv[++i] ?? "";
    else if (a === "--price") flags.price = argv[++i] ?? "";
    else if (a === "--tx-hash") flags.txHash = argv[++i] ?? "";
    else if (a === "--signature") flags.signature = argv[++i] ?? "";
    else if (a === "--payer") flags.payer = argv[++i] ?? "";
    else if (a === "--date") flags.date = argv[++i] ?? "";
    else if (a === "--month") flags.month = argv[++i] ?? "";
    else if (a === "--account-id" || a === "--account") flags.accountId = argv[++i] ?? "";
    else if (a === "--publishable-key") flags.publishableKey = argv[++i] ?? "";
    else if (a === "--webhook-secret") flags.webhookSecret = argv[++i] ?? "";
    else if (a === "--payload") flags.payloadPath = argv[++i] ?? "";
    else if (a === "--process") flags.process = true;
    else if (a === "--facilitator-url") flags.facilitatorUrl = argv[++i] ?? "";
    else if (a === "--tenant-id") flags.tenantId = argv[++i] ?? "";
    else if (a === "--destination") flags.destination = argv[++i] ?? "";
    else if (a === "--creator" || a === "--creator-id") flags.creatorId = argv[++i] ?? "";
    else if (a === "--wallet") flags.wallet = argv[++i] ?? "";
    else if (a === "--method") flags.method = argv[++i] ?? "";
    else if (a === "--country") flags.country = argv[++i] ?? "";
    else if (a === "--refresh-url") flags.refreshUrl = argv[++i] ?? "";
    else if (a === "--user-id") flags.userId = argv[++i] ?? "";
    else if (a === "--agent-id" || a === "--agent") flags.agentId = argv[++i] ?? "";
    else if (a === "--show-secrets") flags.showSecrets = true;
    else if (a === "--vendor-ids") flags.vendorIds = argv[++i] ?? "";
    else if (a === "--interval") flags.interval = argv[++i] ?? "";
    else if (a === "--skip-verify") flags.skipVerify = true;
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
    cmd === "secrets" ||
    cmd === "operator" ||
    cmd === "sources" ||
    cmd === "release" ||
    cmd === "ontology" ||
    cmd === "sync" ||
    cmd === "sandbox" ||
    cmd === "inference" ||
    cmd === "payments"
      ? positional[1]
      : undefined;
  const rest =
    cmd === "secrets" ||
    cmd === "operator" ||
    cmd === "sources" ||
    cmd === "sync" ||
    cmd === "sandbox" ||
    cmd === "inference" ||
    cmd === "payments"
      ? positional.slice(2)
      : cmd === "release" || cmd === "ontology"
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
  clawql ontology lint [--dir PATH] [files...] | generate --out DIR [--dir PATH]
  clawql sync init | push | pull | status [--dry-run] [--force]
  clawql sandbox init | verify | status | edit --harness claude [--path DIR] [--skip-verify]
  clawql inference serve [--port 8080] | complete --model <provider/model> --message <text>
  clawql inference logs [--model M] [--since 24h] [--limit 50] | trace --correlation-id <id> | spend [--group-by model]
  clawql inference export --output <path.jsonl> [--verdict passed] [--format openai-jsonl]
  clawql inference finetune --dataset <path> --base-model <model> [--provider openai|anthropic]
  clawql inference escalation show | set-tier --tier frugal --model ollama/phi4-custom
  clawql inference pipeline enable [--schedule "0 2 * * 0"] [--min-samples 500] | status | disable | run
  clawql inference finetune status --job-id <id> | register --job-id <id> --tier frugal --alias <model>
  clawql payments plan show | upgrade --tier team | usage report [--month YYYY-MM]
  clawql payments stripe setup | customer create --email user@acme.com | subscription create | invoice create | webhook verify
  clawql payments x402 wallet setup --address 0x... | gate --tool knowledge_search --price 0.001 | verify | reconcile
  clawql payments payout connect create --email creator@x.com | connect link --account acct_xxx | create --amount 25 | prefer --creator id --method bank
  clawql payments ramp fund create --limit 500 | card issue --user-id U --limit 100 | agent-card issue --user-id U --amount 25
  clawql payments offramp session --amount 25 --wallet 0x… [--provider moonpay|transak]
  clawql payments offramp webhook --provider moonpay --payload ./body.json --signature t=…,s=… --process
  clawql payments spend report [--group-by provider|tenant|plan] | audit [--correlation-id ID]
  clawql payments credits show | bank-link --customer cus_xxx | topup --customer cus_xxx --amount 25
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

ontology (ADR 0009 — enterprise Ontology):
  lint            Validate entity YAML against schemas/ontology/entity.schema.json
  generate        Emit read MCP tools.json + TypeScript stub (--out DIR)

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
  --smoke         Release manifest verify (when present) + MCP tools/list + search

Environment (Layer 0):
  CLAWQL_RELEASE_MANIFEST       Path to manifest.json — verify at MCP startup (optional)
  CLAWQL_RELEASE_MANIFEST_STRICT=1  Fail startup on verify error (default strict when NODE_ENV=production)

secrets:
  list            Show configured provider keys (masked)
  set             Set one key in vault/providers.json (prompts if value omitted)

sync (team shared memory — R2 default):
  init            Write ~/.ClawQL/sync.json (bucket + prefix; credentials via env/vault)
  push            Upload Memory/, sources/, chats/ to the team bucket
  pull            Download team notes to this machine
  status          Compare local vs remote manifest
  Default provider: r2 (Cloudflare). Also: s3, gcs (S3-compatible API).
  Secrets (providers.json) are never uploaded.

sandbox (local agent containment — macOS Seatbelt, fail-closed):
  init            Per-harness profiles (claude.sb, codex.sb, …) + Claude settings.json
  verify          Containment probes — kernel blocks writes outside WORK_DIR
  status          Active profile per harness
  edit --harness  Open harness profile in $EDITOR (e.g. claude, codex)
  Harness launch: sandbox-exec -f ~/.ClawQL/sandbox/{harness}.sb -D WORK_DIR=…
  Fail closed — never launches unsandboxed when verification fails.

mcp-config:
  Print or write MCP JSON for Cursor / Claude (stdio — secrets loaded from vault at server startup)

inference (gateway MVP):
  serve           OpenAI-compatible HTTP gateway (/healthz, /v1/models, /v1/chat/completions, stream)
  complete        One-shot completion for scripting/debug
  logs            Recent inference records from the call store
  trace           Records for a correlation_id (links to ouroboros / WORM lineage)
  spend           Token usage rollup by model, provider, or tier
  export          Verdict-filtered dataset export with optional Presidio scrub + manifest
  finetune        Submit fine-tuning job; subcommands: status, register
  escalation      show tier map | set-tier --tier <tier> --model <id>
  pipeline        enable | status | disable | run | worker (scheduled auto-export)
  cache           Semantic cache config (CLAWQL_INFERENCE_SEMANTIC_CACHE=1)
  fallback        Per-tier / per-model provider fallback chains
  keys            create | list | revoke virtual API keys (per-team budgets)
  policy          Show effective inference policy (tiers, cache, export rules)
  Providers: openai, anthropic, ollama via provider/model ids (e.g. ollama/phi4)
  Store: CLAWQL_INFERENCE_STORE=memory|jsonl|postgres|off (default jsonl when CLAWQL_HOME set)
  Cache: CLAWQL_INFERENCE_SEMANTIC_CACHE=1, CLAWQL_INFERENCE_CACHE_THRESHOLD=0.92
  Fallback: CLAWQL_INFERENCE_FALLBACK_ENABLED=1, CLAWQL_INFERENCE_FALLBACK_FRUGAL=a,b
  Keys: per-team virtual API keys (see clawql-inference README)
  Env: OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_BASE_URL, CLAWQL_INFERENCE_PORT

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

  if (cmd === "sync") {
    const home = typeof flags.home === "string" && flags.home ? flags.home : undefined;
    if (subcmd === "init") {
      process.exitCode = await runSyncInit({
        home,
        interactive: Boolean(flags.interactive),
        yes: Boolean(flags.yes),
        provider:
          typeof flags.provider === "string" && flags.provider
            ? (flags.provider as "r2" | "s3" | "gcs")
            : undefined,
        bucket: typeof flags.bucket === "string" ? flags.bucket : undefined,
        prefix: typeof flags.prefix === "string" ? flags.prefix : undefined,
      });
      return;
    }
    if (subcmd === "push") {
      process.exitCode = await runSyncPushCmd({
        dryRun: Boolean(flags.dryRun),
        force: Boolean(flags.force),
      });
      return;
    }
    if (subcmd === "pull") {
      process.exitCode = await runSyncPullCmd({
        dryRun: Boolean(flags.dryRun),
        force: Boolean(flags.force),
      });
      return;
    }
    if (subcmd === "status") {
      process.exitCode = await runSyncStatusCmd();
      return;
    }
    console.error("Usage: clawql sync init | push | pull | status");
    process.exitCode = 1;
    return;
  }

  if (cmd === "sandbox") {
    const home = typeof flags.home === "string" && flags.home ? flags.home : undefined;
    if (subcmd === "init") {
      process.exitCode = await runSandboxInitCmd({
        home,
        allowedPath: typeof flags.path === "string" ? flags.path : undefined,
        workDir: process.cwd(),
        skipVerify: Boolean(flags.skipVerify),
      });
      return;
    }
    if (subcmd === "verify") {
      process.exitCode = await runSandboxVerifyCmd(home);
      return;
    }
    if (subcmd === "status") {
      process.exitCode = await runSandboxStatusCmd(home);
      return;
    }
    if (subcmd === "edit") {
      const harness = typeof flags.harness === "string" ? flags.harness : rest[0];
      if (!harness) {
        console.error("Usage: clawql sandbox edit --harness claude");
        process.exitCode = 1;
        return;
      }
      process.exitCode = await runSandboxEditCmd(harness, home);
      return;
    }
    console.error("Usage: clawql sandbox init | verify | status | edit --harness <name>");
    process.exitCode = 1;
    return;
  }

  if (cmd === "inference") {
    const port =
      typeof flags.port === "string" && flags.port ? Number.parseInt(flags.port, 10) : undefined;
    const limit =
      typeof flags.limit === "string" && flags.limit ? Number.parseInt(flags.limit, 10) : undefined;
    const minScore =
      typeof flags.minScore === "string" && flags.minScore
        ? Number.parseFloat(flags.minScore)
        : undefined;
    const maxLatencyMs =
      typeof flags.maxLatencyMs === "string" && flags.maxLatencyMs
        ? Number.parseInt(flags.maxLatencyMs, 10)
        : undefined;
    const minTokenEfficiency =
      typeof flags.minTokenEfficiency === "string" && flags.minTokenEfficiency
        ? Number.parseFloat(flags.minTokenEfficiency)
        : undefined;
    const minSamples =
      typeof flags.minSamples === "string" && flags.minSamples
        ? Number.parseInt(flags.minSamples, 10)
        : undefined;
    const budgetUsd =
      typeof flags.budgetUsd === "string" && flags.budgetUsd
        ? Number.parseFloat(flags.budgetUsd)
        : undefined;
    const targetTier =
      typeof flags.targetTier === "string" &&
      (flags.targetTier === "frugal" ||
        flags.targetTier === "standard" ||
        flags.targetTier === "frontier")
        ? flags.targetTier
        : undefined;
    const finetuneProvider =
      typeof flags.provider === "string" &&
      (flags.provider === "openai" || flags.provider === "anthropic")
        ? flags.provider
        : undefined;
    const tier =
      typeof flags.tier === "string" &&
      (flags.tier === "frugal" || flags.tier === "standard" || flags.tier === "frontier")
        ? flags.tier
        : undefined;
    const verdict =
      typeof flags.verdict === "string" &&
      (flags.verdict === "passed" || flags.verdict === "failed" || flags.verdict === "none")
        ? flags.verdict
        : undefined;
    const format =
      typeof flags.format === "string" &&
      (flags.format === "openai-jsonl" ||
        flags.format === "anthropic-jsonl" ||
        flags.format === "raw-jsonl" ||
        flags.format === "sharegpt")
        ? flags.format
        : undefined;
    const inferenceOpts: InferenceCliOptions = {
      port: Number.isFinite(port) ? port : undefined,
      model: typeof flags.model === "string" ? flags.model : undefined,
      provider: typeof flags.provider === "string" ? flags.provider : undefined,
      message: typeof flags.message === "string" ? flags.message : undefined,
      correlationId: typeof flags.correlationId === "string" ? flags.correlationId : undefined,
      since: typeof flags.since === "string" ? flags.since : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      groupBy:
        typeof flags.groupBy === "string" &&
        (flags.groupBy === "model" ||
          flags.groupBy === "provider" ||
          flags.groupBy === "tier" ||
          flags.groupBy === "team")
          ? flags.groupBy
          : undefined,
      json: Boolean(flags.json),
      output: typeof flags.output === "string" ? flags.output : undefined,
      format,
      verdict,
      minScore: Number.isFinite(minScore) ? minScore : undefined,
      dateFrom: typeof flags.dateFrom === "string" ? flags.dateFrom : undefined,
      dateTo: typeof flags.dateTo === "string" ? flags.dateTo : undefined,
      maxLatencyMs: Number.isFinite(maxLatencyMs) ? maxLatencyMs : undefined,
      minTokenEfficiency: Number.isFinite(minTokenEfficiency) ? minTokenEfficiency : undefined,
      excludeCacheHits: Boolean(flags.excludeCacheHits),
      noPiiScrub: Boolean(flags.noPiiScrub),
      writeManifest: flags.writeManifest === false ? false : undefined,
      dataset: typeof flags.dataset === "string" ? flags.dataset : undefined,
      manifest: typeof flags.manifest === "string" ? flags.manifest : undefined,
      baseModel: typeof flags.baseModel === "string" ? flags.baseModel : undefined,
      finetuneProvider,
      registerAs: typeof flags.registerAs === "string" ? flags.registerAs : undefined,
      jobId: typeof flags.jobId === "string" ? flags.jobId : undefined,
      tier,
      alias: typeof flags.alias === "string" ? flags.alias : undefined,
      schedule: typeof flags.schedule === "string" ? flags.schedule : undefined,
      minSamples: Number.isFinite(minSamples) ? minSamples : undefined,
      targetTier,
      evaluateBeforePromote: Boolean(flags.evaluateBeforePromote),
      outputDir: typeof flags.outputDir === "string" ? flags.outputDir : undefined,
      team: typeof flags.team === "string" ? flags.team : undefined,
      budgetUsd: Number.isFinite(budgetUsd) ? budgetUsd : undefined,
      rateLimit: typeof flags.rateLimit === "string" ? flags.rateLimit : undefined,
      keyId: typeof flags.id === "string" ? flags.id : undefined,
    };
    if (subcmd === "serve") {
      process.exitCode = await runInferenceServeCmd(inferenceOpts);
      return;
    }
    if (subcmd === "complete") {
      process.exitCode = await runInferenceCompleteCmd(inferenceOpts);
      return;
    }
    if (subcmd === "logs") {
      process.exitCode = await runInferenceLogsCmd(inferenceOpts);
      return;
    }
    if (subcmd === "trace") {
      process.exitCode = await runInferenceTraceCmd(inferenceOpts);
      return;
    }
    if (subcmd === "spend") {
      process.exitCode = await runInferenceSpendCmd(inferenceOpts);
      return;
    }
    if (subcmd === "export") {
      process.exitCode = await runInferenceExportCmd(inferenceOpts);
      return;
    }
    if (subcmd === "finetune") {
      const finetuneAction = rest[0];
      if (finetuneAction === "status") {
        process.exitCode = await runInferenceFinetuneStatusCmd(inferenceOpts);
        return;
      }
      if (finetuneAction === "register") {
        process.exitCode = await runInferenceFinetuneRegisterCmd(inferenceOpts);
        return;
      }
      process.exitCode = await runInferenceFinetuneCmd(inferenceOpts);
      return;
    }
    if (subcmd === "escalation") {
      const escalationAction = rest[0];
      if (escalationAction === "set-tier") {
        process.exitCode = await runInferenceEscalationSetTierCmd(inferenceOpts);
        return;
      }
      process.exitCode = await runInferenceEscalationShowCmd(inferenceOpts);
      return;
    }
    if (subcmd === "pipeline") {
      const pipelineAction = rest[0];
      if (pipelineAction === "status") {
        process.exitCode = await runInferencePipelineStatusCmd(inferenceOpts);
        return;
      }
      if (pipelineAction === "disable") {
        process.exitCode = await runInferencePipelineDisableCmd(inferenceOpts);
        return;
      }
      if (pipelineAction === "run") {
        process.exitCode = await runInferencePipelineRunCmd(inferenceOpts);
        return;
      }
      if (pipelineAction === "worker") {
        process.exitCode = await runInferencePipelineWorkerCmd(inferenceOpts);
        return;
      }
      process.exitCode = await runInferencePipelineEnableCmd(inferenceOpts);
      return;
    }
    if (subcmd === "cache") {
      process.exitCode = await runInferenceCacheStatusCmd(inferenceOpts);
      return;
    }
    if (subcmd === "fallback") {
      process.exitCode = await runInferenceFallbackShowCmd(inferenceOpts);
      return;
    }
    if (subcmd === "policy") {
      process.exitCode = await runInferencePolicyShowCmd(inferenceOpts);
      return;
    }
    if (subcmd === "keys") {
      const keysAction = rest[0];
      if (keysAction === "create") {
        process.exitCode = await runInferenceKeysCreateCmd(inferenceOpts);
        return;
      }
      if (keysAction === "list") {
        process.exitCode = await runInferenceKeysListCmd(inferenceOpts);
        return;
      }
      if (keysAction === "revoke") {
        process.exitCode = await runInferenceKeysRevokeCmd(inferenceOpts);
        return;
      }
      console.error(
        "Usage: clawql inference keys create --team <name> | list | revoke --id <vk_...>"
      );
      process.exitCode = 1;
      return;
    }
    console.error(
      "Usage: clawql inference serve | complete | logs | trace | spend | export | finetune | escalation | pipeline | cache | fallback | keys | policy"
    );
    process.exitCode = 1;
    return;
  }

  if (cmd === "payments") {
    const amount =
      typeof flags.amount === "string" && flags.amount
        ? Number.parseFloat(flags.amount)
        : undefined;
    const price =
      typeof flags.price === "string" && flags.price ? Number.parseFloat(flags.price) : undefined;
    const value =
      typeof flags.value === "string" && flags.value ? Number.parseFloat(flags.value) : undefined;
    const limit =
      typeof flags.limit === "string" && flags.limit ? Number.parseInt(flags.limit, 10) : undefined;
    const paymentsOpts: PaymentsCliOptions = {
      tier: typeof flags.tier === "string" ? flags.tier : undefined,
      month: typeof flags.month === "string" ? flags.month : undefined,
      groupBy:
        typeof flags.groupBy === "string" &&
        (flags.groupBy === "provider" || flags.groupBy === "tenant" || flags.groupBy === "plan")
          ? flags.groupBy
          : undefined,
      correlationId: typeof flags.correlationId === "string" ? flags.correlationId : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      json: Boolean(flags.json),
      email: typeof flags.email === "string" ? flags.email : undefined,
      name: typeof flags.name === "string" ? flags.name : undefined,
      customer: typeof flags.customer === "string" ? flags.customer : undefined,
      plan: typeof flags.plan === "string" ? flags.plan : undefined,
      amount: Number.isFinite(amount) ? amount : undefined,
      address: typeof flags.address === "string" ? flags.address : undefined,
      asset: typeof flags.asset === "string" && flags.asset === "USDC" ? "USDC" : undefined,
      resource: typeof flags.resource === "string" ? flags.resource : undefined,
      tool: typeof flags.tool === "string" ? flags.tool : undefined,
      price: Number.isFinite(price) ? price : undefined,
      txHash: typeof flags.txHash === "string" ? flags.txHash : undefined,
      signature: typeof flags.signature === "string" ? flags.signature : undefined,
      payer: typeof flags.payer === "string" ? flags.payer : undefined,
      date: typeof flags.date === "string" ? flags.date : undefined,
      tenantId: typeof flags.tenantId === "string" ? flags.tenantId : undefined,
      accountId: typeof flags.accountId === "string" ? flags.accountId : undefined,
      publishableKey: typeof flags.publishableKey === "string" ? flags.publishableKey : undefined,
      webhookSecret: typeof flags.webhookSecret === "string" ? flags.webhookSecret : undefined,
      facilitatorUrl: typeof flags.facilitatorUrl === "string" ? flags.facilitatorUrl : undefined,
      payloadPath: typeof flags.payloadPath === "string" ? flags.payloadPath : undefined,
      process: Boolean(flags.process),
      eventName: typeof flags.eventName === "string" ? flags.eventName : undefined,
      identifier: typeof flags.identifier === "string" ? flags.identifier : undefined,
      value: Number.isFinite(value) ? value : undefined,
      destination:
        typeof flags.destination === "string" &&
        (flags.destination === "bank" || flags.destination === "usdc")
          ? flags.destination
          : undefined,
      creatorId: typeof flags.creatorId === "string" ? flags.creatorId : undefined,
      wallet: typeof flags.wallet === "string" ? flags.wallet : undefined,
      method:
        typeof flags.method === "string" && (flags.method === "bank" || flags.method === "usdc")
          ? flags.method
          : undefined,
      country: typeof flags.country === "string" ? flags.country : undefined,
      returnUrl: typeof flags.returnUrl === "string" ? flags.returnUrl : undefined,
      refreshUrl: typeof flags.refreshUrl === "string" ? flags.refreshUrl : undefined,
      userId: typeof flags.userId === "string" ? flags.userId : undefined,
      agentId: typeof flags.agentId === "string" ? flags.agentId : undefined,
      showSecrets: Boolean(flags.showSecrets),
      vendorIds:
        typeof flags.vendorIds === "string" && flags.vendorIds
          ? flags.vendorIds
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      interval:
        typeof flags.interval === "string" &&
        ["DAILY", "WEEKLY", "MONTHLY", "TOTAL", "ANNUAL"].includes(flags.interval)
          ? (flags.interval as PaymentsCliOptions["interval"])
          : undefined,
      provider:
        typeof flags.provider === "string" &&
        (flags.provider === "moonpay" || flags.provider === "transak")
          ? flags.provider
          : undefined,
      paymentMethodId:
        typeof flags.paymentMethodId === "string" ? flags.paymentMethodId : undefined,
    };

    if (subcmd === "plan") {
      const action = rest[0];
      if (action === "upgrade") {
        process.exitCode = await runPaymentsPlanUpgradeCmd(paymentsOpts);
        return;
      }
      process.exitCode = await runPaymentsPlanShowCmd(paymentsOpts);
      return;
    }
    if (subcmd === "usage") {
      process.exitCode = await runPaymentsUsageReportCmd(paymentsOpts);
      return;
    }
    if (subcmd === "spend") {
      process.exitCode = await runPaymentsSpendReportCmd(paymentsOpts);
      return;
    }
    if (subcmd === "audit") {
      if (rest[0] === "verify") {
        process.exitCode = await runPaymentsAuditVerifyCmd(paymentsOpts);
        return;
      }
      process.exitCode = await runPaymentsAuditCmd(paymentsOpts);
      return;
    }
    if (subcmd === "stripe") {
      const stripeAction = rest[0];
      if (stripeAction === "setup") {
        process.exitCode = await runPaymentsStripeSetupCmd(paymentsOpts);
        return;
      }
      if (stripeAction === "customer" && rest[1] === "create") {
        process.exitCode = await runPaymentsStripeCustomerCreateCmd(paymentsOpts);
        return;
      }
      if (stripeAction === "subscription" && rest[1] === "create") {
        process.exitCode = await runPaymentsStripeSubscriptionCreateCmd(paymentsOpts);
        return;
      }
      if (stripeAction === "invoice" && rest[1] === "create") {
        process.exitCode = await runPaymentsStripeInvoiceCreateCmd(paymentsOpts);
        return;
      }
      if (stripeAction === "webhook" && rest[1] === "listen") {
        process.exitCode = await runPaymentsStripeWebhookListenCmd();
        return;
      }
      if (stripeAction === "webhook" && rest[1] === "verify") {
        process.exitCode = await runPaymentsStripeWebhookVerifyCmd(paymentsOpts);
        return;
      }
      if (stripeAction === "meter" && rest[1] === "report") {
        process.exitCode = await runPaymentsStripeMeterReportCmd(paymentsOpts);
        return;
      }
      console.error(
        "Usage: clawql payments stripe setup | customer create | subscription create | invoice create | meter report | webhook listen | webhook verify"
      );
      process.exitCode = 1;
      return;
    }
    if (subcmd === "x402") {
      const x402Action = rest[0];
      if (x402Action === "wallet" && rest[1] === "setup") {
        process.exitCode = await runPaymentsX402WalletSetupCmd(paymentsOpts);
        return;
      }
      if (x402Action === "gate") {
        if (rest[1] === "list") {
          process.exitCode = await runPaymentsX402GateListCmd(paymentsOpts);
          return;
        }
        process.exitCode = await runPaymentsX402GateCmd(paymentsOpts);
        return;
      }
      if (x402Action === "verify") {
        process.exitCode = await runPaymentsX402VerifyCmd(paymentsOpts);
        return;
      }
      if (x402Action === "reconcile") {
        process.exitCode = await runPaymentsX402ReconcileCmd(paymentsOpts);
        return;
      }
      console.error(
        "Usage: clawql payments x402 wallet setup | gate | gate list | verify | reconcile"
      );
      process.exitCode = 1;
      return;
    }
    if (subcmd === "payout") {
      const action = rest[0];
      if (action === "connect" && rest[1] === "create") {
        process.exitCode = await runPaymentsPayoutConnectCreateCmd(paymentsOpts);
        return;
      }
      if (action === "connect" && rest[1] === "link") {
        process.exitCode = await runPaymentsPayoutConnectLinkCmd(paymentsOpts);
        return;
      }
      if (action === "create") {
        process.exitCode = await runPaymentsPayoutCreateCmd(paymentsOpts);
        return;
      }
      if (action === "prefer") {
        process.exitCode = await runPaymentsPayoutPreferCmd(paymentsOpts);
        return;
      }
      console.error(
        "Usage: clawql payments payout connect create | connect link | create | prefer"
      );
      process.exitCode = 1;
      return;
    }
    if (subcmd === "ramp") {
      const action = rest[0];
      if (action === "fund" && rest[1] === "create") {
        process.exitCode = await runPaymentsRampFundCreateCmd(paymentsOpts);
        return;
      }
      if (action === "card" && rest[1] === "issue") {
        process.exitCode = await runPaymentsRampCardIssueCmd(paymentsOpts);
        return;
      }
      if (action === "agent-card" && rest[1] === "issue") {
        process.exitCode = await runPaymentsRampAgentCardIssueCmd(paymentsOpts);
        return;
      }
      console.error("Usage: clawql payments ramp fund create | card issue | agent-card issue");
      process.exitCode = 1;
      return;
    }
    if (subcmd === "offramp") {
      if (rest[0] === "session") {
        process.exitCode = await runPaymentsOfframpSessionCmd(paymentsOpts);
        return;
      }
      if (rest[0] === "webhook") {
        process.exitCode = await runPaymentsOfframpWebhookCmd(paymentsOpts);
        return;
      }
      console.error(
        "Usage: clawql payments offramp session | webhook --provider moonpay|transak --payload FILE [--signature …] [--process]"
      );
      process.exitCode = 1;
      return;
    }
    if (subcmd === "credits") {
      const creditsAction = rest[0] ?? "show";
      if (creditsAction === "show") {
        process.exitCode = await runPaymentsCreditsShowCmd(paymentsOpts);
        return;
      }
      if (creditsAction === "bank-link") {
        process.exitCode = await runPaymentsCreditsBankLinkCmd(paymentsOpts);
        return;
      }
      if (creditsAction === "topup") {
        process.exitCode = await runPaymentsCreditsTopupCmd(paymentsOpts);
        return;
      }
      console.error("Usage: clawql payments credits show | bank-link | topup");
      process.exitCode = 1;
      return;
    }
    console.error(
      "Usage: clawql payments plan | usage | spend | audit | stripe | x402 | payout | ramp | offramp | credits"
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

  if (cmd === "ontology") {
    const ontologyOpts = {
      root:
        (typeof flags.root === "string" && flags.root
          ? flags.root
          : undefined) ||
        (typeof flags.home === "string" && flags.home ? flags.home : undefined),
      schema: typeof flags.schema === "string" && flags.schema ? flags.schema : undefined,
      dir: typeof flags.dir === "string" && flags.dir ? flags.dir : undefined,
      out: typeof flags.out === "string" && flags.out ? flags.out : undefined,
      strict: Boolean(flags.strict),
      skipLint: Boolean(flags.skipLint),
      json: Boolean(flags.json),
      paths: rest,
    };
    if (subcmd === "lint") {
      process.exitCode = await runOntologyLint(ontologyOpts);
      return;
    }
    if (subcmd === "generate") {
      process.exitCode = await runOntologyGenerate(ontologyOpts);
      return;
    }
    console.error("Usage: clawql ontology lint | generate --out DIR");
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

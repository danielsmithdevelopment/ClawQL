/**
 * `clawql doctor` — onboarding health and vault status.
 */

import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { execSync } from "node:child_process";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { DEFAULT_STACK_VAULT_ENTRIES } from "../provider-vault/catalog.js";
import { readLocalProvidersVault } from "../provider-vault/local-store.js";
import { getClawqlEnvFilePath, getClawqlHome, getLocalProvidersVaultPath } from "./paths.js";
import { inferSpecMode } from "./spec-mode.js";
import { probeHashicorpVault } from "./hashicorp-vault.js";
import { runReleaseDoctorCheck } from "./release-doctor-check.js";
import { runOntologyDoctorChecks } from "./ontology-doctor-check.js";
import { runCelldDoctorChecks } from "./celld-doctor-check.js";
import {
  doctorChecksFromRuntimeLadder,
  runRuntimeLadderInteractive,
} from "./runtime-ladder-prompt.js";
import { runMcpSmoke } from "./smoke.js";
import { sandboxDoctorCheck } from "clawql-sandbox/init";
import { networkDoctorCheck } from "clawql-network/init";
import { resolveLocalClawqlMcpBinary } from "./mcp-config.js";
import { Effect } from "effect";

export type DoctorCheck = {
  level: "ok" | "warn" | "fail";
  message: string;
  detail?: string;
};

export type DoctorReport = {
  checks: DoctorCheck[];
  specMode: string;
  home: string;
};

function inferSpecModeFromEnv(): string {
  return inferSpecMode();
}

async function pathWritable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(
  verbose = false,
  options: { smoke?: boolean } = {}
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const home = getClawqlHome();

  const nodeMajor = Number(process.version.replace(/^v/, "").split(".")[0]);
  if (nodeMajor >= 22) {
    checks.push({ level: "ok", message: `Node ${process.version} (>= 22)` });
  } else {
    checks.push({ level: "warn", message: `Node ${process.version} — ClawQL requires >= 22` });
  }

  // Audit 2.14: check the local binary only — never `npx` (network / unpinned).
  {
    const local = resolveLocalClawqlMcpBinary();
    if (local) {
      checks.push({ level: "ok", message: `clawql-mcp local binary: ${local}` });
    } else {
      let pathBin: string | undefined;
      try {
        pathBin = execSync("command -v clawql-mcp", {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        })
          .trim()
          .split("\n")[0];
      } catch {
        pathBin = undefined;
      }
      if (pathBin) {
        checks.push({ level: "ok", message: `clawql-mcp on PATH: ${pathBin}` });
      } else {
        checks.push({
          level: "warn",
          message:
            "clawql-mcp binary not found locally — npm i clawql-mcp or npm run build in repo",
          detail: "doctor does not download via npx",
        });
      }
    }
  }

  if (existsSync(home)) {
    checks.push({ level: "ok", message: `ClawQL home: ${home}` });
  } else {
    checks.push({
      level: "warn",
      message: `ClawQL home missing: ${home}`,
      detail: "Run: npx clawql init",
    });
  }

  const envFile = getClawqlEnvFilePath(home);
  if (existsSync(envFile)) {
    checks.push({ level: "ok", message: `Config: ${envFile}` });
    // Audit Z2: plaintext operator approve key on disk is readable by same-user agent shells.
    try {
      const { readFileSync } = await import("node:fs");
      const { clawqlEnvContainsPlaintextOperatorKey } = await import("clawql-payments/x402");
      const envContents = readFileSync(envFile, "utf8");
      if (clawqlEnvContainsPlaintextOperatorKey(envContents)) {
        checks.push({
          level: "warn",
          message: "clawql.env contains plaintext CLAWQL_OPERATOR_APPROVE_KEY (audit Z2)",
          detail:
            "Store CLAWQL_OPERATOR_APPROVE_KEY_HASH (sha256 hex) instead; enter the key from a password manager at approve time. Remove CLAWQL_OPERATOR_APPROVE_KEY from clawql.env.",
        });
      }
    } catch {
      // payments package unavailable in some install layouts — skip quietly
    }
  } else {
    checks.push({
      level: "warn",
      message: "clawql.env not found",
      detail: "Run: npx clawql init",
    });
  }

  // Audit Z2: process env still holds plaintext approve key without hash.
  if (
    process.env.CLAWQL_OPERATOR_APPROVE_KEY?.trim() &&
    !process.env.CLAWQL_OPERATOR_APPROVE_KEY_HASH?.trim()
  ) {
    checks.push({
      level: "warn",
      message:
        "CLAWQL_OPERATOR_APPROVE_KEY set without CLAWQL_OPERATOR_APPROVE_KEY_HASH (audit Z2)",
      detail:
        "Prefer hash-only server config. Set CLAWQL_ALLOW_OPERATOR_APPROVE_KEY_PLAINTEXT=1 only for migration.",
    });
  }

  // Audit Z4: harness marker is advisory — remind when outbound approve is configured.
  if (
    process.env.CLAWQL_OPERATOR_APPROVE_KEY_HASH?.trim() ||
    process.env.CLAWQL_OPERATOR_APPROVE_KEY?.trim() ||
    process.env.CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE?.trim()
  ) {
    checks.push({
      level: "warn",
      message: "Outbound payment approve: CLAWQL_IN_HARNESS is advisory (audit Z4)",
      detail:
        "An unsandboxed agent can unset the marker and read CLAWQL_HOME. Prefer human-approved OIDC from a separate session/device (console), or sandbox agent shells so they cannot see the ClawQL folder.",
    });
  }

  const vaultPath = getObsidianVaultPath();
  if (vaultPath) {
    const writable = await pathWritable(vaultPath);
    checks.push({
      level: writable ? "ok" : "fail",
      message: `Obsidian vault: ${vaultPath}`,
      detail: writable ? undefined : "Path not readable/writable — memory_* disabled at startup",
    });
    // Vault root is normally CLAWQL_HOME; notes live under Memory/. Warn only when
    // someone nested the vault at home/Memory (would write Memory/Memory/).
    const { resolve: resolvePath, join: joinPath } = await import("node:path");
    if (resolvePath(vaultPath) === resolvePath(joinPath(home, "Memory"))) {
      checks.push({
        level: "warn",
        message: "Memory vault is nested under Memory/",
        detail: `Set CLAWQL_OBSIDIAN_VAULT_PATH=${home} so notes stay at ${home}/Memory (not Memory/Memory)`,
      });
    }
  } else if (existsSync(home)) {
    checks.push({
      level: "warn",
      message: "CLAWQL_OBSIDIAN_VAULT_PATH unset",
      detail: `Run clawql init or set CLAWQL_OBSIDIAN_VAULT_PATH=${home}`,
    });
  } else {
    checks.push({
      level: "warn",
      message: "Memory vault not configured",
      detail: "clawql init creates ~/.ClawQL and sets CLAWQL_OBSIDIAN_VAULT_PATH to that home",
    });
  }

  const providersPath = getLocalProvidersVaultPath(home);
  const localVault = await readLocalProvidersVault(providersPath);
  if (localVault && Object.keys(localVault.data).length > 0) {
    checks.push({
      level: "ok",
      message: `Provider secrets vault: ${providersPath} (${Object.keys(localVault.data).length} keys)`,
    });
    if (verbose) {
      checks.push({
        level: "ok",
        message: `Configured: ${Object.keys(localVault.data).join(", ")}`,
      });
    }
    for (const entry of DEFAULT_STACK_VAULT_ENTRIES) {
      if (!localVault.data[entry.vaultProperty]?.trim()) {
        checks.push({
          level: "warn",
          message: `Missing default-stack secret: ${entry.label}`,
          detail: `npx clawql init --interactive`,
        });
      }
    }
  } else {
    checks.push({
      level: "warn",
      message: "No local provider secrets vault",
      detail: "Run: npx clawql init --interactive (secrets → vault/providers.json)",
    });
    for (const entry of DEFAULT_STACK_VAULT_ENTRIES) {
      const hasEnv = entry.envAliases.some((a) => process.env[a]?.trim());
      if (!hasEnv) {
        checks.push({ level: "warn", message: `No credential for ${entry.label}` });
      }
    }
  }

  const hv = await probeHashicorpVault();
  if (hv.reachable) {
    checks.push({
      level: "ok",
      message: `HashiCorp Vault reachable (${hv.source}: ${hv.addr ?? "unknown"})`,
      detail: hv.hint,
    });
  } else if (process.env.VAULT_ADDR?.trim() && process.env.VAULT_TOKEN?.trim()) {
    checks.push({
      level: "ok",
      message:
        "HashiCorp Vault env set — clawql init --push-vault syncs to secret/clawql/providers",
    });
  }

  const mcpUrl = process.env.CLAWQL_MCP_URL?.trim();
  if (mcpUrl) {
    try {
      const res = await fetch(`${mcpUrl.replace(/\/$/, "")}/healthz`);
      if (res.ok) {
        const body = verbose ? await res.text() : undefined;
        checks.push({ level: "ok", message: `HTTP health: ${mcpUrl}/healthz`, detail: body });
      } else {
        checks.push({ level: "fail", message: `HTTP health failed: ${res.status}` });
      }
    } catch (e: unknown) {
      checks.push({
        level: "fail",
        message: `HTTP health unreachable: ${mcpUrl}`,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  checks.push({ level: "ok", message: `Spec mode: ${inferSpecModeFromEnv()}` });
  checks.push(...(await runOntologyDoctorChecks()));
  // celld → Bun → Node ladder (TTY prompts install; non-TTY prints hints)
  const { decision: runtimeLadder } = await runRuntimeLadderInteractive(process.env, {
    interactive: Boolean(process.stdin.isTTY) && !options.smoke,
  });
  checks.push(...doctorChecksFromRuntimeLadder(runtimeLadder));
  checks.push(...(await runCelldDoctorChecks()));
  checks.push(await Effect.runPromise(networkDoctorCheck(home)));

  if (options.smoke) {
    checks.push(await runReleaseDoctorCheck());
    const sandboxCheck = await sandboxDoctorCheck(home, { smoke: true });
    checks.push(sandboxCheck);
    const smoke = await runMcpSmoke();
    for (const step of smoke.steps) {
      checks.push({
        level: step.status === "pass" ? "ok" : step.status === "warn" ? "warn" : "fail",
        message: `smoke ${step.name}`,
        detail: step.detail,
      });
    }
  } else {
    checks.push({
      level: "ok",
      message: "MCP smoke: not run",
      detail: "clawql doctor --smoke",
    });
  }

  return { checks, specMode: inferSpecModeFromEnv(), home };
}

export function formatDoctorReport(report: DoctorReport, verbose = false): string {
  const lines: string[] = ["ClawQL doctor", ""];
  for (const c of report.checks) {
    const icon = c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "✗";
    lines.push(`  ${icon} ${c.message}`);
    if ((verbose || c.level !== "ok") && c.detail) {
      for (const d of c.detail.split("\n")) {
        lines.push(`      ${d}`);
      }
    }
  }
  lines.push(
    "",
    "Next:",
    "  npx clawql init --interactive",
    "  npx clawql doctor --smoke",
    "  npx clawql security celld --json",
    "  npx clawql mcp-config --write cursor",
    "  https://docs.clawql.com/agent-setup",
    ""
  );
  return lines.join("\n");
}

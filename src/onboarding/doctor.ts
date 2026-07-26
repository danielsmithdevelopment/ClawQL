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
import { runMcpSmoke } from "./smoke.js";
import { sandboxDoctorCheck } from "clawql-sandbox/init";

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

  try {
    execSync("npx -y clawql-mcp --help", { stdio: "ignore" });
    checks.push({ level: "ok", message: "clawql-mcp resolvable via npx" });
  } catch {
    checks.push({
      level: "warn",
      message: "clawql-mcp not verified — npm i clawql-mcp or npm run build in repo",
    });
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
  } else {
    checks.push({
      level: "warn",
      message: "clawql.env not found",
      detail: "Run: npx clawql init",
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
      detail: "clawql init creates ~/.ClawQL and sets CLAWQL_OBSIDIAN_VAULT_PATH",
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
    "  npx clawql mcp-config --write cursor",
    "  https://docs.clawql.com/agent-setup",
    ""
  );
  return lines.join("\n");
}

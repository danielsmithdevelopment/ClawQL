/**
 * `clawql onboard` — end-to-end first-run walkthrough (init → MCP config → doctor smoke).
 */

import { formatDoctorReport, runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { writeMcpConfigFile, type McpWriteTarget } from "./mcp-config-write.js";

export type OnboardOptions = {
  yes?: boolean;
  interactive?: boolean;
  fromEnv?: string;
  pushVault?: boolean;
  writeMcp?: McpWriteTarget | false;
  smoke?: boolean;
  home?: string;
  json?: boolean;
};

export type OnboardStep = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type OnboardResult = {
  steps: OnboardStep[];
  home: string;
  providersVault: string;
  mcpConfigPath?: string;
  doctorFailed: boolean;
};

export async function runOnboard(options: OnboardOptions = {}): Promise<OnboardResult> {
  const steps: OnboardStep[] = [];
  const interactive = options.interactive ?? !options.yes;
  const writeMcp = options.writeMcp === false ? undefined : (options.writeMcp ?? "cursor");
  const runSmoke = options.smoke !== false;

  console.log("\nClawQL onboard — vault-first first run\n");

  let initResult: Awaited<ReturnType<typeof runInit>>;
  try {
    initResult = await runInit({
      yes: options.yes,
      interactive,
      fromEnv: options.fromEnv,
      pushVault: options.pushVault,
      home: options.home,
    });
    steps.push({
      name: "init",
      ok: true,
      detail: `${initResult.home} (${initResult.providerKeys.length} secret keys)`,
    });
  } catch (e: unknown) {
    steps.push({
      name: "init",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
    return {
      steps,
      home: options.home ?? "",
      providersVault: "",
      doctorFailed: true,
    };
  }

  let mcpConfigPath: string | undefined;
  if (writeMcp) {
    try {
      const wr = await writeMcpConfigFile(writeMcp);
      mcpConfigPath = wr.path;
      steps.push({
        name: "mcp-config",
        ok: true,
        detail: `${wr.path}${wr.backupPath ? ` (backup ${wr.backupPath})` : ""}`,
      });
    } catch (e: unknown) {
      steps.push({
        name: "mcp-config",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    steps.push({ name: "mcp-config", ok: true, detail: "skipped" });
  }

  let doctorFailed = false;
  if (runSmoke) {
    const report = await runDoctor(false, { smoke: true });
    for (const check of report.checks.filter((c) => c.message.startsWith("smoke "))) {
      steps.push({
        name: check.message.replace(/^smoke /, "smoke:"),
        ok: check.level !== "fail",
        detail: check.detail,
      });
      if (check.level === "fail") doctorFailed = true;
    }
    if (!options.json) {
      console.log(formatDoctorReport(report, false));
    }
  } else {
    steps.push({ name: "doctor --smoke", ok: true, detail: "skipped" });
  }

  const result: OnboardResult = {
    steps,
    home: initResult.home,
    providersVault: initResult.providersVault,
    mcpConfigPath,
    doctorFailed,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printOnboardSummary(result);
  }

  return result;
}

export function printOnboardSummary(result: OnboardResult): void {
  console.log("\nOnboard summary\n");
  for (const step of result.steps) {
    const icon = step.ok ? "✓" : "✗";
    console.log(`  ${icon} ${step.name}${step.detail ? `: ${step.detail}` : ""}`);
  }
  console.log("\nNext:");
  console.log("  Restart Cursor or Claude Desktop (MCP config changed)");
  console.log("  clawql secrets set github   — add more provider keys");
  console.log("  clawql doctor --smoke       — re-check after adding secrets");
  console.log("  https://docs.clawql.com/agent-setup\n");
}

export function onboardExitCode(result: OnboardResult): number {
  if (result.steps.some((s) => !s.ok)) return 1;
  if (result.doctorFailed) return 1;
  return 0;
}

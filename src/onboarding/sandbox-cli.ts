/**
 * `clawql sandbox` — local agent containment (macOS Seatbelt, fail-closed).
 */
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import {
  isSandboxHarnessId,
  loadContainmentConfig,
  runSandboxInit,
  runSandboxVerify,
  sandboxPaths,
  SANDBOX_HARNESS_IDS,
  type SandboxHarnessId,
} from "clawql-sandbox/init";
import { getClawqlHome } from "./paths.js";

export type SandboxCliInitOptions = {
  home?: string;
  allowedPath?: string;
  workDir?: string;
  skipVerify?: boolean;
};

function formatVerifyReport(
  verify: Awaited<ReturnType<typeof runSandboxVerify>>
): string {
  const lines = [
    "ClawQL sandbox containment",
    `  platform: ${verify.platform}`,
    `  seatbelt:   ${verify.seatbeltPresent ? "yes" : "no"}`,
    `  ok:         ${verify.ok ? "yes" : "NO"}`,
  ];
  if (verify.error) lines.push(`  error:      ${verify.error}`);
  for (const c of verify.checks) {
    lines.push(`  - ${c.name}: ${c.ok ? "ok" : "FAIL"} (${c.detail})`);
  }
  return lines.join("\n");
}

export async function runSandboxInitCmd(opts: SandboxCliInitOptions = {}): Promise<number> {
  const clawqlHome = opts.home ?? getClawqlHome();
  const allowedPaths = opts.allowedPath ? [opts.allowedPath] : undefined;
  const skipVerify = opts.skipVerify ?? process.platform !== "darwin";

  try {
    const result = await runSandboxInit({
      clawqlHome,
      allowedPaths,
      workDir: opts.workDir ?? process.cwd(),
      skipVerify,
    });

    console.log("ClawQL sandbox init complete\n");
    console.log(`  Config:   ${result.paths.configPath}`);
    console.log(`  Claude:   ${result.paths.claudeSettingsPath} (native /sandbox layer)`);
    console.log(`  Wrapper:  ${result.paths.wrapperPath}`);
    console.log(`  Allowed:  ${result.config.allowedPaths.join(", ")}`);
    console.log(`  Denied:   ${result.config.deniedPaths.join(", ")}`);
    console.log(`  failClosed: ${result.config.failClosed}`);
    console.log("\n  Harness profiles:");
    for (const h of SANDBOX_HARNESS_IDS) {
      console.log(`    ${h}: ${result.harnessProfiles[h]}`);
    }

    if (skipVerify && process.platform !== "darwin") {
      console.log(
        "\nNote: full Seatbelt verification requires macOS. Run `clawql sandbox verify` on a Mac before launching agents."
      );
    } else if (result.verify) {
      console.log(`\n${formatVerifyReport(result.verify)}`);
      if (!result.verify.ok) return 1;
    }

    console.log("\nNext:");
    console.log("  clawql sandbox verify          Re-check containment");
    console.log("  clawql doctor --smoke          Includes sandbox verify when enabled");
    console.log("  clawql codex | claude | ...    Per-harness sandbox-exec wrapper\n");
    return 0;
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

export async function runSandboxVerifyCmd(home?: string): Promise<number> {
  const verify = await runSandboxVerify(home ?? getClawqlHome(), process.cwd());
  console.log(formatVerifyReport(verify));
  return verify.ok ? 0 : 1;
}

export async function runSandboxStatusCmd(home?: string): Promise<number> {
  const clawqlHome = home ?? getClawqlHome();
  const config = await loadContainmentConfig(clawqlHome);
  const paths = sandboxPaths(clawqlHome);

  if (!config) {
    console.log("Sandbox containment: not configured");
    console.log("  Run: clawql sandbox init");
    return 1;
  }

  console.log("Sandbox containment status\n");
  console.log(`  enabled:    ${config.enabled}`);
  console.log(`  failClosed: ${config.failClosed}`);
  console.log(`  backend:    ${config.backend}`);
  console.log(`  workDir:    ${config.workDir ?? "(cwd at launch)"}`);
  console.log(`  allowed:    ${config.allowedPaths.join(", ")}`);
  console.log(`  denied:     ${config.deniedPaths.join(", ")}`);
  if (config.lastVerifiedAt) {
    console.log(
      `  lastVerify: ${config.lastVerifiedAt} (${config.lastVerifyOk ? "ok" : "FAILED"})`
    );
  }

  console.log("\n  Per-harness profiles:");
  for (const h of SANDBOX_HARNESS_IDS) {
    const p = paths.harnessProfilePath(h);
    let exists = false;
    try {
      await access(p, constants.R_OK);
      exists = true;
    } catch {
      /* profile missing */
    }
    const layer =
      h === "claude"
        ? "Seatbelt wrapper + Claude /sandbox (settings.json)"
        : "sandbox-exec wrapper only";
    console.log(`    ${h}: ${exists ? p : "(missing)"} — ${layer}`);
  }

  try {
    const last = await readFile(paths.verifyResultPath, "utf8");
    const parsed = JSON.parse(last) as { checks?: { name: string; ok: boolean }[] };
    if (parsed.checks?.length) {
      console.log("\n  Last probe checks:");
      for (const c of parsed.checks) {
        console.log(`    - ${c.name}: ${c.ok ? "ok" : "FAIL"}`);
      }
    }
  } catch {
    // no verify artifact yet
  }

  return config.lastVerifyOk === false ? 1 : 0;
}

export async function runSandboxEditCmd(harnessRaw: string, home?: string): Promise<number> {
  if (!isSandboxHarnessId(harnessRaw)) {
    console.error(`Unknown harness "${harnessRaw}" — expected: ${SANDBOX_HARNESS_IDS.join(", ")}`);
    return 1;
  }
  const harness = harnessRaw as SandboxHarnessId;
  const clawqlHome = home ?? getClawqlHome();
  const paths = sandboxPaths(clawqlHome);
  const profilePath = paths.harnessProfilePath(harness);
  try {
    await access(profilePath, constants.R_OK);
  } catch {
    console.error(`Profile not found: ${profilePath}`);
    console.error("Run: clawql sandbox init");
    return 1;
  }

  const editor = process.env.EDITOR?.trim() || process.env.VISUAL?.trim() || "nano";
  console.log(`Opening ${profilePath} with ${editor} …`);
  return new Promise((resolve) => {
    const child = spawn(editor, [profilePath], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code === 0 ? 0 : 1));
    child.on("error", (err) => {
      console.error(err.message);
      console.error(`Edit manually: ${profilePath}`);
      resolve(1);
    });
  });
}

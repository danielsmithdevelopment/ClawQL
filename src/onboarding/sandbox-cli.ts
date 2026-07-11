/**
 * `clawql sandbox` — local agent containment (macOS Seatbelt, fail-closed).
 */
import { readFile } from "node:fs/promises";
import {
  loadContainmentConfig,
  runSandboxInit,
  runSandboxVerify,
  sandboxPaths,
} from "clawql-sandbox/init";
import { getClawqlHome } from "./paths.js";

export type SandboxCliInitOptions = {
  home?: string;
  allowedPath?: string;
  skipVerify?: boolean;
};

function formatVerifyReport(verify: Awaited<ReturnType<typeof runSandboxVerify>>): string {
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
      skipVerify,
    });

    console.log("ClawQL sandbox init complete\n");
    console.log(`  Config:   ${result.paths.configPath}`);
    console.log(`  Profile:  ${result.paths.agentProfilePath}`);
    console.log(`  Wrapper:  ${result.paths.wrapperPath}`);
    console.log(`  Allowed:  ${result.config.allowedPaths.join(", ")}`);
    console.log(`  Denied:   ${result.config.deniedPaths.join(", ")}`);
    console.log(`  failClosed: ${result.config.failClosed}`);

    if (skipVerify && process.platform !== "darwin") {
      console.log(
        "\nNote: full Seatbelt verification requires macOS. Run `clawql sandbox verify` on a Mac before launching agents."
      );
    } else if (result.verify) {
      console.log(`\n${formatVerifyReport(result.verify)}`);
      if (!result.verify.ok) return 1;
    }

    console.log("\nNext:");
    console.log("  clawql sandbox verify     Re-check containment before agent sessions");
    console.log("  clawql codex | claude     Launch harness inside Seatbelt when configured");
    console.log(`  ${result.paths.wrapperPath} <cmd>   Manual wrapper\n`);
    return 0;
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

export async function runSandboxVerifyCmd(home?: string): Promise<number> {
  const verify = await runSandboxVerify(home ?? getClawqlHome());
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
  console.log(`  allowed:    ${config.allowedPaths.join(", ")}`);
  console.log(`  denied:     ${config.deniedPaths.join(", ")}`);
  if (config.lastVerifiedAt) {
    console.log(
      `  lastVerify: ${config.lastVerifiedAt} (${config.lastVerifyOk ? "ok" : "FAILED"})`
    );
  }

  try {
    const last = await readFile(paths.verifyResultPath, "utf8");
    const parsed = JSON.parse(last) as { checks?: { name: string; ok: boolean }[] };
    if (parsed.checks?.length) {
      console.log("\nLast probe checks:");
      for (const c of parsed.checks) {
        console.log(`  - ${c.name}: ${c.ok ? "ok" : "FAIL"}`);
      }
    }
  } catch {
    // no verify artifact yet
  }

  return config.lastVerifyOk === false ? 1 : 0;
}

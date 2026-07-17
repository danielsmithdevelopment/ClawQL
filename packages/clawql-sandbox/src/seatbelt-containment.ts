import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { seatbeltBinaryPresent } from "./capabilities.js";
import type { SandboxContainmentConfig } from "./seatbelt-config.js";
import {
  resolvedAllowedPaths,
  resolvedDeniedPaths,
  seatbeltProfileParams,
} from "./seatbelt-config.js";
import { shellDoubleQuotedLiteral } from "./seatbelt-paths.js";
import { sandboxExecArgv } from "./seatbelt-profile.js";

export type ContainmentCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type ContainmentVerifyResult = {
  ok: boolean;
  platform: NodeJS.Platform;
  seatbeltPresent: boolean;
  checks: ContainmentCheck[];
  error?: string;
};

function runSandboxProbe(
  profilePath: string,
  shellScript: string,
  params: Record<string, string>,
  timeoutMs = 8000
): Promise<{ exitCode: number; stderr: string }> {
  const exe = "/usr/bin/sandbox-exec";
  const args = sandboxExecArgv(profilePath, params, "/bin/sh", ["-c", shellScript]);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(exe, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(t);
      rejectPromise(err);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolvePromise({ exitCode: code ?? -1, stderr });
    });
  });
}

async function probeDeniedRead(
  profilePath: string,
  params: Record<string, string>,
  deniedPath: string
): Promise<ContainmentCheck> {
  const script = `test ! -r "${shellDoubleQuotedLiteral(deniedPath)}"`;
  try {
    const { exitCode } = await runSandboxProbe(profilePath, script, params);
    return {
      name: `deny-read:${deniedPath}`,
      ok: exitCode === 0,
      detail: exitCode === 0 ? "read blocked" : `read succeeded (exit ${exitCode})`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: `deny-read:${deniedPath}`, ok: false, detail: msg };
  }
}

async function probeAllowedRead(
  profilePath: string,
  params: Record<string, string>,
  allowedPath: string
): Promise<ContainmentCheck> {
  const escaped = shellDoubleQuotedLiteral(allowedPath);
  const script = `test -d "${escaped}" || test -r "${escaped}"`;
  try {
    const { exitCode } = await runSandboxProbe(profilePath, script, params);
    return {
      name: `allow-read:${allowedPath}`,
      ok: exitCode === 0,
      detail: exitCode === 0 ? "read allowed" : `read blocked (exit ${exitCode})`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: `allow-read:${allowedPath}`, ok: false, detail: msg };
  }
}

async function probeWriteOutsideWorkDir(
  profilePath: string,
  params: Record<string, string>,
  home: string
): Promise<ContainmentCheck> {
  const outside = join(home, ".clawql-sandbox-probe-outside");
  const escapedOutside = shellDoubleQuotedLiteral(outside);
  const script = `rm -f "${escapedOutside}" 2>/dev/null; echo probe > "${escapedOutside}" 2>/dev/null; test ! -f "${escapedOutside}"`;
  try {
    const { exitCode } = await runSandboxProbe(profilePath, script, params);
    return {
      name: "deny-write-outside-work-dir",
      ok: exitCode === 0,
      detail: exitCode === 0 ? "write outside WORK_DIR blocked" : "write outside succeeded",
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: "deny-write-outside-work-dir", ok: false, detail: msg };
  }
}

/**
 * Run Seatbelt containment probes with profile params (-D WORK_DIR=...).
 */
export async function verifySeatbeltContainment(
  profilePath: string,
  config: SandboxContainmentConfig,
  workDir: string,
  home = homedir()
): Promise<ContainmentVerifyResult> {
  const platform = process.platform;
  const seatbeltPresent = seatbeltBinaryPresent();
  const params = seatbeltProfileParams(config, workDir, home);

  if (platform !== "darwin") {
    return {
      ok: false,
      platform,
      seatbeltPresent: false,
      checks: [],
      error:
        "macOS Seatbelt containment requires darwin. Use Kata/VM escalation for non-macOS hosts.",
    };
  }

  if (!seatbeltPresent) {
    return {
      ok: false,
      platform,
      seatbeltPresent: false,
      checks: [],
      error: "sandbox-exec not found at /usr/bin/sandbox-exec",
    };
  }

  const checks: ContainmentCheck[] = [];
  const denied = resolvedDeniedPaths(config, home).slice(0, 3);
  for (const p of denied) {
    checks.push(await probeDeniedRead(profilePath, params, p));
  }

  const allowed = resolvedAllowedPaths(config, home).slice(0, 2);
  for (const p of allowed) {
    await mkdir(p, { recursive: true }).catch(() => undefined);
    checks.push(await probeAllowedRead(profilePath, params, p));
  }

  checks.push(await probeWriteOutsideWorkDir(profilePath, params, home));

  const ok = checks.every((c) => c.ok);
  return {
    ok,
    platform,
    seatbeltPresent: true,
    checks,
    ...(ok ? {} : { error: "One or more containment probes failed" }),
  };
}

export async function writeVerifyResult(
  path: string,
  result: ContainmentVerifyResult
): Promise<void> {
  await writeFile(
    path,
    `${JSON.stringify({ verifiedAt: new Date().toISOString(), ...result }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
}

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { seatbeltBinaryPresent } from "./capabilities.js";
import type { SandboxContainmentConfig } from "./seatbelt-config.js";
import { resolvedAllowedPaths, resolvedDeniedPaths } from "./seatbelt-config.js";

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
  timeoutMs = 8000
): Promise<{ exitCode: number; stderr: string }> {
  const exe = "/usr/bin/sandbox-exec";
  const args = ["-f", profilePath, "--", "/bin/sh", "-c", shellScript];
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

async function probeDeniedRead(profilePath: string, deniedPath: string): Promise<ContainmentCheck> {
  const script = `test ! -r "${deniedPath.replace(/"/g, '\\"')}"`;
  try {
    const { exitCode } = await runSandboxProbe(profilePath, script);
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
  allowedPath: string
): Promise<ContainmentCheck> {
  const script = `test -d "${allowedPath.replace(/"/g, '\\"')}" || test -r "${allowedPath.replace(/"/g, '\\"')}"`;
  try {
    const { exitCode } = await runSandboxProbe(profilePath, script);
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

async function probeWriteOutsideAllowed(
  profilePath: string,
  home: string
): Promise<ContainmentCheck> {
  const outside = join(home, ".clawql-sandbox-probe-outside");
  const script = `rm -f "${outside}" 2>/dev/null; echo probe > "${outside}" 2>/dev/null; test ! -f "${outside}"`;
  try {
    const { exitCode } = await runSandboxProbe(profilePath, script);
    return {
      name: "deny-write-outside-allowed",
      ok: exitCode === 0,
      detail: exitCode === 0 ? "write outside blocked" : "write outside succeeded",
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name: "deny-write-outside-allowed", ok: false, detail: msg };
  }
}

/**
 * Run Seatbelt containment probes. On non-macOS returns ok=false when failClosed is expected.
 */
export async function verifySeatbeltContainment(
  profilePath: string,
  config: SandboxContainmentConfig,
  home = homedir()
): Promise<ContainmentVerifyResult> {
  const platform = process.platform;
  const seatbeltPresent = seatbeltBinaryPresent();

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
    checks.push(await probeDeniedRead(profilePath, p));
  }

  const allowed = resolvedAllowedPaths(config, home).slice(0, 2);
  for (const p of allowed) {
    await mkdir(p, { recursive: true }).catch(() => undefined);
    checks.push(await probeAllowedRead(profilePath, p));
  }

  checks.push(await probeWriteOutsideAllowed(profilePath, home));

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

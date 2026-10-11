import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
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

function runSandboxProbeEffect(
  profilePath: string,
  shellScript: string,
  params: Record<string, string>,
  timeoutMs = 8000
): Effect.Effect<{ exitCode: number; stderr: string }, Error> {
  return Effect.tryPromise({
    try: () =>
      new Promise<{ exitCode: number; stderr: string }>((resolvePromise, rejectPromise) => {
        const exe = "/usr/bin/sandbox-exec";
        const args = sandboxExecArgv(profilePath, params, "/bin/sh", ["-c", shellScript]);
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
      }),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

function probeDeniedReadEffect(
  profilePath: string,
  params: Record<string, string>,
  deniedPath: string
): Effect.Effect<ContainmentCheck> {
  const script = `test ! -r "${shellDoubleQuotedLiteral(deniedPath)}"`;
  return runSandboxProbeEffect(profilePath, script, params).pipe(
    Effect.map(({ exitCode }) => ({
      name: `deny-read:${deniedPath}`,
      ok: exitCode === 0,
      detail: exitCode === 0 ? "read blocked" : `read succeeded (exit ${exitCode})`,
    })),
    Effect.catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      return Effect.succeed({
        name: `deny-read:${deniedPath}`,
        ok: false,
        detail: msg,
      } satisfies ContainmentCheck);
    })
  );
}

function probeAllowedReadEffect(
  profilePath: string,
  params: Record<string, string>,
  allowedPath: string
): Effect.Effect<ContainmentCheck> {
  const escaped = shellDoubleQuotedLiteral(allowedPath);
  const script = `test -d "${escaped}" || test -r "${escaped}"`;
  return runSandboxProbeEffect(profilePath, script, params).pipe(
    Effect.map(({ exitCode }) => ({
      name: `allow-read:${allowedPath}`,
      ok: exitCode === 0,
      detail: exitCode === 0 ? "read allowed" : `read blocked (exit ${exitCode})`,
    })),
    Effect.catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      return Effect.succeed({
        name: `allow-read:${allowedPath}`,
        ok: false,
        detail: msg,
      } satisfies ContainmentCheck);
    })
  );
}

function probeWriteOutsideWorkDirEffect(
  profilePath: string,
  params: Record<string, string>,
  home: string
): Effect.Effect<ContainmentCheck> {
  const outside = join(home, ".clawql-sandbox-probe-outside");
  const escapedOutside = shellDoubleQuotedLiteral(outside);
  const script = `rm -f "${escapedOutside}" 2>/dev/null; echo probe > "${escapedOutside}" 2>/dev/null; test ! -f "${escapedOutside}"`;
  return runSandboxProbeEffect(profilePath, script, params).pipe(
    Effect.map(({ exitCode }) => ({
      name: "deny-write-outside-work-dir",
      ok: exitCode === 0,
      detail: exitCode === 0 ? "write outside WORK_DIR blocked" : "write outside succeeded",
    })),
    Effect.catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      return Effect.succeed({
        name: "deny-write-outside-work-dir",
        ok: false,
        detail: msg,
      } satisfies ContainmentCheck);
    })
  );
}

/**
 * Run Seatbelt containment probes with profile params (-D WORK_DIR=...).
 * Soft-fails into {@link ContainmentVerifyResult} (Effect success channel).
 */
export function verifySeatbeltContainmentEffect(
  profilePath: string,
  config: SandboxContainmentConfig,
  workDir: string,
  home = homedir()
): Effect.Effect<ContainmentVerifyResult> {
  return Effect.gen(function* () {
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
      } satisfies ContainmentVerifyResult;
    }

    if (!seatbeltPresent) {
      return {
        ok: false,
        platform,
        seatbeltPresent: false,
        checks: [],
        error: "sandbox-exec not found at /usr/bin/sandbox-exec",
      } satisfies ContainmentVerifyResult;
    }

    const checks: ContainmentCheck[] = [];
    const denied = resolvedDeniedPaths(config, home).slice(0, 3);
    for (const p of denied) {
      checks.push(yield* probeDeniedReadEffect(profilePath, params, p));
    }

    const allowed = resolvedAllowedPaths(config, home).slice(0, 2);
    for (const p of allowed) {
      yield* Effect.tryPromise({
        try: () => mkdir(p, { recursive: true }),
        catch: () => undefined,
      }).pipe(Effect.catch(() => Effect.void));
      checks.push(yield* probeAllowedReadEffect(profilePath, params, p));
    }

    checks.push(yield* probeWriteOutsideWorkDirEffect(profilePath, params, home));

    const ok = checks.every((c) => c.ok);
    return {
      ok,
      platform,
      seatbeltPresent: true,
      checks,
      ...(ok ? {} : { error: "One or more containment probes failed" }),
    } satisfies ContainmentVerifyResult;
  });
}

/** Promise façade for CLI / hosts that still await containment verify. */
export async function verifySeatbeltContainment(
  profilePath: string,
  config: SandboxContainmentConfig,
  workDir: string,
  home = homedir()
): Promise<ContainmentVerifyResult> {
  return Effect.runPromise(verifySeatbeltContainmentEffect(profilePath, config, workDir, home));
}

/** Persist last containment verify result (Effect-primary). */
export function writeVerifyResultEffect(
  path: string,
  result: ContainmentVerifyResult
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () =>
      writeFile(
        path,
        `${JSON.stringify({ verifiedAt: new Date().toISOString(), ...result }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 }
      ),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade for CLI / hosts that still await verify result writes. */
export async function writeVerifyResult(
  path: string,
  result: ContainmentVerifyResult
): Promise<void> {
  return Effect.runPromise(writeVerifyResultEffect(path, result));
}

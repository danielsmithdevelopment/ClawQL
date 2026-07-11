import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeClaudeSandboxSettings } from "./claude-sandbox-settings.js";
import {
  defaultClawqlHome,
  defaultContainmentConfig,
  dedupePaths,
  loadContainmentConfig,
  saveContainmentConfig,
  sandboxPaths,
  seatbeltProfileParams,
  SANDBOX_HARNESS_IDS,
  type SandboxContainmentConfig,
  type SandboxHarnessId,
} from "./seatbelt-config.js";
import {
  buildExecSeatbeltProfile,
  buildHarnessSeatbeltProfile,
  sandboxExecArgv,
} from "./seatbelt-profile.js";
import {
  verifySeatbeltContainment,
  writeVerifyResult,
  type ContainmentVerifyResult,
} from "./seatbelt-containment.js";
import { seatbeltBinaryPresent } from "./capabilities.js";

export type SandboxInitOptions = {
  clawqlHome?: string;
  workDir?: string;
  allowedPaths?: string[];
  deniedPaths?: string[];
  yes?: boolean;
  skipVerify?: boolean;
};

export type SandboxInitResult = {
  paths: ReturnType<typeof sandboxPaths>;
  config: SandboxContainmentConfig;
  verify: ContainmentVerifyResult | null;
  harnessProfiles: Record<SandboxHarnessId, string>;
};

export type HarnessSandboxGate =
  | { ok: true; wrap: false }
  | {
      ok: true;
      wrap: true;
      profilePath: string;
      profileParams: Record<string, string>;
      sandboxArgv: (binary: string, args: string[]) => string[];
    }
  | { ok: false; error: string };

export type SandboxDoctorCheck = {
  level: "ok" | "warn" | "fail";
  message: string;
  detail?: string;
};

function resolveWorkDir(config: SandboxContainmentConfig, override?: string): string {
  return resolve(override ?? config.workDir ?? process.cwd());
}

export async function runSandboxInit(opts: SandboxInitOptions = {}): Promise<SandboxInitResult> {
  const clawqlHome = opts.clawqlHome ?? defaultClawqlHome();
  const workDir = resolve(opts.workDir ?? process.cwd());
  const existing = await loadContainmentConfig(clawqlHome);
  const config = existing ?? defaultContainmentConfig({ clawqlHome, workDir });

  if (opts.allowedPaths?.length) {
    config.allowedPaths = dedupePaths([...opts.allowedPaths, clawqlHome]);
  } else if (!existing) {
    config.allowedPaths = dedupePaths([...config.allowedPaths, clawqlHome]);
  }

  if (opts.deniedPaths?.length) {
    config.deniedPaths = dedupePaths([...config.deniedPaths, ...opts.deniedPaths]);
  }

  config.enabled = true;
  config.failClosed = true;
  config.clawqlHome = clawqlHome;
  config.workDir = workDir;

  const paths = await saveContainmentConfig(config, clawqlHome);
  await mkdir(paths.sandboxDir, { recursive: true, mode: 0o700 });

  const harnessProfiles: Record<SandboxHarnessId, string> = {} as Record<
    SandboxHarnessId,
    string
  >;
  for (const harness of SANDBOX_HARNESS_IDS) {
    const profile = buildHarnessSeatbeltProfile(config, harness);
    const profilePath = paths.harnessProfilePath(harness);
    await writeFile(profilePath, profile, { encoding: "utf8", mode: 0o600 });
    harnessProfiles[harness] = profilePath;
  }

  const execProfile = buildExecSeatbeltProfile(config, paths.sandboxDir);
  await writeFile(paths.execProfilePath, execProfile, { encoding: "utf8", mode: 0o600 });

  await writeClaudeSandboxSettings(config, paths.claudeSettingsPath, workDir);

  const wrapperBody = `#!/bin/bash
# clawql-safe — run a command inside ClawQL Seatbelt (fail-closed).
# Usage: clawql-safe <harness|path-to-binary> [args...]
set -euo pipefail
HARNESS="\${1:-}"
shift || true
SANDBOX_DIR="${paths.sandboxDir}"
if [[ -f "$SANDBOX_DIR/\${HARNESS}.sb" ]]; then
  PROFILE="$SANDBOX_DIR/\${HARNESS}.sb"
elif [[ -f "$HARNESS" ]]; then
  PROFILE="$SANDBOX_DIR/claude.sb"
  set -- "$HARNESS" "$@"
else
  echo "clawql-safe: unknown harness or binary: $HARNESS" >&2
  exit 1
fi
WORK_DIR="\${CLAWQL_SANDBOX_WORK_DIR:-$(pwd)}"
exec /usr/bin/sandbox-exec -f "$PROFILE" \\
  -D "WORK_DIR=$WORK_DIR" \\
  -D "CLAWQL_DIR=${clawqlHome}" \\
  -D "HOME_SSH=$HOME/.ssh" \\
  -D "HOME_AWS=$HOME/.aws" \\
  -D "HOME_CONFIG=$HOME/.config" \\
  -- "$@"
`;
  await writeFile(paths.wrapperPath, wrapperBody, { encoding: "utf8", mode: 0o700 });
  await chmod(paths.wrapperPath, 0o700);

  let verify: ContainmentVerifyResult | null = null;
  if (!opts.skipVerify) {
    const probeHarness: SandboxHarnessId = "codex";
    verify = await verifySeatbeltContainment(
      paths.harnessProfilePath(probeHarness),
      config,
      workDir
    );
    config.lastVerifiedAt = new Date().toISOString();
    config.lastVerifyOk = verify.ok;
    await saveContainmentConfig(config, clawqlHome);
    await writeVerifyResult(paths.verifyResultPath, verify);
    if (config.failClosed && !verify.ok) {
      throw new Error(
        verify.error ??
          "Seatbelt containment verification failed — refusing fail-open. Fix paths or run on macOS with sandbox-exec."
      );
    }
  }

  return { paths, config, verify, harnessProfiles };
}

export async function runSandboxVerify(
  clawqlHome?: string,
  workDir?: string
): Promise<ContainmentVerifyResult> {
  const home = clawqlHome ?? defaultClawqlHome();
  const config = await loadContainmentConfig(home);
  if (!config?.enabled) {
    return {
      ok: false,
      platform: process.platform,
      seatbeltPresent: seatbeltBinaryPresent(),
      checks: [],
      error: "Sandbox containment not configured — run: clawql sandbox init",
    };
  }

  const paths = sandboxPaths(home);
  const wd = resolveWorkDir(config, workDir);
  const verify = await verifySeatbeltContainment(
    paths.harnessProfilePath("codex"),
    config,
    wd
  );
  config.lastVerifiedAt = new Date().toISOString();
  config.lastVerifyOk = verify.ok;
  await saveContainmentConfig(config, home);
  await writeVerifyResult(paths.verifyResultPath, verify);
  return verify;
}

export async function ensureHarnessSandboxGate(
  harness: SandboxHarnessId,
  clawqlHome?: string,
  workDir?: string
): Promise<HarnessSandboxGate> {
  const home = clawqlHome ?? defaultClawqlHome();
  const config = await loadContainmentConfig(home);
  if (!config?.enabled) return { ok: true, wrap: false };

  const paths = sandboxPaths(home);
  const wd = resolveWorkDir(config, workDir);
  const profilePath = paths.harnessProfilePath(harness);
  const verify = await verifySeatbeltContainment(profilePath, config, wd);
  await writeVerifyResult(paths.verifyResultPath, verify);

  if (!verify.ok) {
    const msg =
      verify.error ??
      "Seatbelt containment verification failed — refusing to launch agent unsandboxed (fail-closed).";
    if (config.failClosed) return { ok: false, error: msg };
    console.error(`[clawql sandbox] warning: ${msg}`);
    return { ok: true, wrap: false };
  }

  if (process.platform !== "darwin" || !seatbeltBinaryPresent()) {
    if (config.failClosed) {
      return {
        ok: false,
        error:
          "Sandbox enabled with failClosed but macOS sandbox-exec is unavailable on this host.",
      };
    }
    return { ok: true, wrap: false };
  }

  const profileParams = seatbeltProfileParams(config, wd);
  return {
    ok: true,
    wrap: true,
    profilePath,
    profileParams,
    sandboxArgv: (binary, args) => sandboxExecArgv(profilePath, profileParams, binary, args),
  };
}

export async function sandboxDoctorCheck(
  clawqlHome?: string,
  options: { smoke?: boolean } = {}
): Promise<SandboxDoctorCheck> {
  const home = clawqlHome ?? defaultClawqlHome();
  const config = await loadContainmentConfig(home);
  if (!config?.enabled) {
    return {
      level: "ok",
      message: "Sandbox containment: not enabled",
      detail: "Optional: clawql sandbox init",
    };
  }

  if (!options.smoke) {
    return {
      level: config.lastVerifyOk === false ? "fail" : "ok",
      message: `Sandbox containment: enabled (failClosed=${config.failClosed})`,
      detail: config.lastVerifiedAt
        ? `last verify: ${config.lastVerifiedAt} (${config.lastVerifyOk ? "ok" : "FAILED"}) — run clawql doctor --smoke`
        : "run clawql sandbox verify",
    };
  }

  const verify = await runSandboxVerify(home);
  return {
    level: verify.ok ? "ok" : "fail",
    message: verify.ok
      ? "Sandbox containment verified (Seatbelt active)"
      : "Sandbox containment verification FAILED",
    detail: verify.error ?? verify.checks.map((c) => `${c.name}: ${c.detail}`).join("; "),
  };
}

export function execProfileForContainment(
  config: SandboxContainmentConfig | null,
  workspaceRoot: string
): string | null {
  if (!config?.enabled) return null;
  return buildExecSeatbeltProfile(config, workspaceRoot);
}

export function harnessProfilePathFor(
  harness: SandboxHarnessId,
  clawqlHome = defaultClawqlHome()
): string {
  return sandboxPaths(clawqlHome).harnessProfilePath(harness);
}

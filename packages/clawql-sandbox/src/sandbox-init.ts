import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Effect } from "effect";
import { writeClaudeSandboxSettingsEffect } from "./claude-sandbox-settings.js";
import {
  defaultClawqlHome,
  defaultContainmentConfig,
  dedupePaths,
  loadContainmentConfigEffect,
  saveContainmentConfigEffect,
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
  verifySeatbeltContainmentEffect,
  writeVerifyResultEffect,
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

function fsError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/** Initialize Seatbelt containment profiles + config (Effect-primary). */
export function runSandboxInitEffect(
  opts: SandboxInitOptions = {}
): Effect.Effect<SandboxInitResult, Error> {
  return Effect.gen(function* () {
    const clawqlHome = opts.clawqlHome ?? defaultClawqlHome();
    const workDir = resolve(opts.workDir ?? process.cwd());
    const existing = yield* loadContainmentConfigEffect(clawqlHome);
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

    const paths = yield* saveContainmentConfigEffect(config, clawqlHome);
    yield* Effect.tryPromise({
      try: () => mkdir(paths.sandboxDir, { recursive: true, mode: 0o700 }),
      catch: fsError,
    });

    const harnessProfiles: Record<SandboxHarnessId, string> = {} as Record<
      SandboxHarnessId,
      string
    >;
    for (const harness of SANDBOX_HARNESS_IDS) {
      const profile = buildHarnessSeatbeltProfile(config, harness);
      const profilePath = paths.harnessProfilePath(harness);
      yield* Effect.tryPromise({
        try: () => writeFile(profilePath, profile, { encoding: "utf8", mode: 0o600 }),
        catch: fsError,
      });
      harnessProfiles[harness] = profilePath;
    }

    const execProfile = buildExecSeatbeltProfile(config, paths.sandboxDir);
    yield* Effect.tryPromise({
      try: () => writeFile(paths.execProfilePath, execProfile, { encoding: "utf8", mode: 0o600 }),
      catch: fsError,
    });

    yield* writeClaudeSandboxSettingsEffect(config, paths.claudeSettingsPath, workDir);

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
    yield* Effect.tryPromise({
      try: () => writeFile(paths.wrapperPath, wrapperBody, { encoding: "utf8", mode: 0o700 }),
      catch: fsError,
    });
    yield* Effect.tryPromise({
      try: () => chmod(paths.wrapperPath, 0o700),
      catch: fsError,
    });

    let verify: ContainmentVerifyResult | null = null;
    if (!opts.skipVerify) {
      const probeHarness: SandboxHarnessId = "codex";
      verify = yield* verifySeatbeltContainmentEffect(
        paths.harnessProfilePath(probeHarness),
        config,
        workDir
      );
      config.lastVerifiedAt = new Date().toISOString();
      config.lastVerifyOk = verify.ok;
      yield* saveContainmentConfigEffect(config, clawqlHome);
      yield* writeVerifyResultEffect(paths.verifyResultPath, verify);
      if (config.failClosed && !verify.ok) {
        return yield* Effect.fail(
          new Error(
            verify.error ??
              "Seatbelt containment verification failed — refusing fail-open. Fix paths or run on macOS with sandbox-exec."
          )
        );
      }
    }

    return { paths, config, verify, harnessProfiles };
  });
}

/** Promise façade for CLI / hosts that still await sandbox init. */
export async function runSandboxInit(opts: SandboxInitOptions = {}): Promise<SandboxInitResult> {
  return Effect.runPromise(runSandboxInitEffect(opts));
}

/** Re-run Seatbelt containment verification (Effect-primary). */
export function runSandboxVerifyEffect(
  clawqlHome?: string,
  workDir?: string
): Effect.Effect<ContainmentVerifyResult, Error> {
  return Effect.gen(function* () {
    const home = clawqlHome ?? defaultClawqlHome();
    const config = yield* loadContainmentConfigEffect(home);
    if (!config?.enabled) {
      return {
        ok: false,
        platform: process.platform,
        seatbeltPresent: seatbeltBinaryPresent(),
        checks: [],
        error: "Sandbox containment not configured — run: clawql sandbox init",
      } satisfies ContainmentVerifyResult;
    }

    const paths = sandboxPaths(home);
    const wd = resolveWorkDir(config, workDir);
    const verify = yield* verifySeatbeltContainmentEffect(
      paths.harnessProfilePath("codex"),
      config,
      wd
    );
    config.lastVerifiedAt = new Date().toISOString();
    config.lastVerifyOk = verify.ok;
    yield* saveContainmentConfigEffect(config, home);
    yield* writeVerifyResultEffect(paths.verifyResultPath, verify);
    return verify;
  });
}

/** Promise façade for CLI / hosts that still await sandbox verify. */
export async function runSandboxVerify(
  clawqlHome?: string,
  workDir?: string
): Promise<ContainmentVerifyResult> {
  return Effect.runPromise(runSandboxVerifyEffect(clawqlHome, workDir));
}

/** Fail-closed harness launch gate (Effect-primary). Soft-fails into {@link HarnessSandboxGate}. */
export function ensureHarnessSandboxGateEffect(
  harness: SandboxHarnessId,
  clawqlHome?: string,
  workDir?: string
): Effect.Effect<HarnessSandboxGate, Error> {
  return Effect.gen(function* () {
    const home = clawqlHome ?? defaultClawqlHome();
    const config = yield* loadContainmentConfigEffect(home);
    if (!config?.enabled) return { ok: true, wrap: false } satisfies HarnessSandboxGate;

    const paths = sandboxPaths(home);
    const wd = resolveWorkDir(config, workDir);
    const profilePath = paths.harnessProfilePath(harness);
    const verify = yield* verifySeatbeltContainmentEffect(profilePath, config, wd);
    yield* writeVerifyResultEffect(paths.verifyResultPath, verify);

    if (!verify.ok) {
      const msg =
        verify.error ??
        "Seatbelt containment verification failed — refusing to launch agent unsandboxed (fail-closed).";
      if (config.failClosed) return { ok: false, error: msg } satisfies HarnessSandboxGate;
      console.error(`[clawql sandbox] warning: ${msg}`);
      return { ok: true, wrap: false } satisfies HarnessSandboxGate;
    }

    if (process.platform !== "darwin" || !seatbeltBinaryPresent()) {
      if (config.failClosed) {
        return {
          ok: false,
          error:
            "Sandbox enabled with failClosed but macOS sandbox-exec is unavailable on this host.",
        } satisfies HarnessSandboxGate;
      }
      return { ok: true, wrap: false } satisfies HarnessSandboxGate;
    }

    const profileParams = seatbeltProfileParams(config, wd);
    return {
      ok: true,
      wrap: true,
      profilePath,
      profileParams,
      sandboxArgv: (binary, args) => sandboxExecArgv(profilePath, profileParams, binary, args),
    } satisfies HarnessSandboxGate;
  });
}

/** Promise façade for CLI / hosts that still await harness sandbox gates. */
export async function ensureHarnessSandboxGate(
  harness: SandboxHarnessId,
  clawqlHome?: string,
  workDir?: string
): Promise<HarnessSandboxGate> {
  return Effect.runPromise(ensureHarnessSandboxGateEffect(harness, clawqlHome, workDir));
}

/** Doctor status for Seatbelt containment (Effect-primary). */
export function sandboxDoctorCheckEffect(
  clawqlHome?: string,
  options: { smoke?: boolean } = {}
): Effect.Effect<SandboxDoctorCheck, Error> {
  return Effect.gen(function* () {
    const home = clawqlHome ?? defaultClawqlHome();
    const config = yield* loadContainmentConfigEffect(home);
    if (!config?.enabled) {
      return {
        level: "ok",
        message: "Sandbox containment: not enabled",
        detail: "Optional: clawql sandbox init",
      } satisfies SandboxDoctorCheck;
    }

    if (!options.smoke) {
      return {
        level: config.lastVerifyOk === false ? "fail" : "ok",
        message: `Sandbox containment: enabled (failClosed=${config.failClosed})`,
        detail: config.lastVerifiedAt
          ? `last verify: ${config.lastVerifiedAt} (${config.lastVerifyOk ? "ok" : "FAILED"}) — run clawql doctor --smoke`
          : "run clawql sandbox verify",
      } satisfies SandboxDoctorCheck;
    }

    const verify = yield* runSandboxVerifyEffect(home);
    return {
      level: verify.ok ? "ok" : "fail",
      message: verify.ok
        ? "Sandbox containment verified (Seatbelt active)"
        : "Sandbox containment verification FAILED",
      detail: verify.error ?? verify.checks.map((c) => `${c.name}: ${c.detail}`).join("; "),
    } satisfies SandboxDoctorCheck;
  });
}

/** Promise façade for CLI / hosts that still await sandbox doctor checks. */
export async function sandboxDoctorCheck(
  clawqlHome?: string,
  options: { smoke?: boolean } = {}
): Promise<SandboxDoctorCheck> {
  return Effect.runPromise(sandboxDoctorCheckEffect(clawqlHome, options));
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

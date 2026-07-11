import { chmod, mkdir, writeFile } from "node:fs/promises";
import {
  defaultClawqlHome,
  defaultContainmentConfig,
  dedupePaths,
  loadContainmentConfig,
  saveContainmentConfig,
  sandboxPaths,
  type SandboxContainmentConfig,
} from "./seatbelt-config.js";
import { buildAgentSeatbeltProfile, buildExecSeatbeltProfile } from "./seatbelt-profile.js";
import {
  verifySeatbeltContainment,
  writeVerifyResult,
  type ContainmentVerifyResult,
} from "./seatbelt-containment.js";
import { seatbeltBinaryPresent } from "./capabilities.js";

export type SandboxInitOptions = {
  clawqlHome?: string;
  allowedPaths?: string[];
  deniedPaths?: string[];
  yes?: boolean;
  skipVerify?: boolean;
};

export type SandboxInitResult = {
  paths: ReturnType<typeof sandboxPaths>;
  config: SandboxContainmentConfig;
  verify: ContainmentVerifyResult | null;
};

export type HarnessSandboxGate =
  | { ok: true; wrap: false }
  | { ok: true; wrap: true; profilePath: string }
  | { ok: false; error: string };

export async function runSandboxInit(opts: SandboxInitOptions = {}): Promise<SandboxInitResult> {
  const clawqlHome = opts.clawqlHome ?? defaultClawqlHome();
  const existing = await loadContainmentConfig(clawqlHome);
  const config = existing ?? defaultContainmentConfig({ clawqlHome });

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

  const paths = await saveContainmentConfig(config, clawqlHome);
  await mkdir(paths.sandboxDir, { recursive: true, mode: 0o700 });

  const agentProfile = buildAgentSeatbeltProfile(config);
  await writeFile(paths.agentProfilePath, agentProfile, { encoding: "utf8", mode: 0o600 });

  const execProfile = buildExecSeatbeltProfile(config, paths.sandboxDir);
  await writeFile(paths.execProfilePath, execProfile, { encoding: "utf8", mode: 0o600 });

  const wrapperBody = `#!/bin/bash
# clawql-safe — run an agent CLI inside ClawQL Seatbelt containment (fail-closed).
set -euo pipefail
PROFILE="${paths.agentProfilePath}"
if [[ ! -f "$PROFILE" ]]; then
  echo "clawql-safe: missing $PROFILE — run: clawql sandbox init" >&2
  exit 1
fi
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "clawql-safe: macOS Seatbelt required" >&2
  exit 1
fi
exec /usr/bin/sandbox-exec -f "$PROFILE" -- "$@"
`;
  await writeFile(paths.wrapperPath, wrapperBody, { encoding: "utf8", mode: 0o700 });
  await chmod(paths.wrapperPath, 0o700);

  let verify: ContainmentVerifyResult | null = null;
  if (!opts.skipVerify) {
    verify = await verifySeatbeltContainment(paths.agentProfilePath, config);
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

  return { paths, config, verify };
}

export async function runSandboxVerify(clawqlHome?: string): Promise<ContainmentVerifyResult> {
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
  const verify = await verifySeatbeltContainment(paths.agentProfilePath, config);
  config.lastVerifiedAt = new Date().toISOString();
  config.lastVerifyOk = verify.ok;
  await saveContainmentConfig(config, home);
  await writeVerifyResult(paths.verifyResultPath, verify);
  return verify;
}

export async function ensureHarnessSandboxGate(clawqlHome?: string): Promise<HarnessSandboxGate> {
  const home = clawqlHome ?? defaultClawqlHome();
  const config = await loadContainmentConfig(home);
  if (!config?.enabled) return { ok: true, wrap: false };

  const paths = sandboxPaths(home);
  const verify = await verifySeatbeltContainment(paths.agentProfilePath, config);
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

  return { ok: true, wrap: true, profilePath: paths.agentProfilePath };
}

export function execProfileForContainment(
  config: SandboxContainmentConfig | null,
  workspaceRoot: string
): string | null {
  if (!config?.enabled) return null;
  return buildExecSeatbeltProfile(config, workspaceRoot);
}

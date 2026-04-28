/**
 * Probes for sandbox_exec backends: Seatbelt binary, Docker/Podman CLI, Cloudflare bridge credentials.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";

let dockerProbe: Promise<boolean> | undefined;

/** Test-only: reset cached Docker CLI probe between Vitest cases. */
export function resetSandboxDockerProbeForTest(): void {
  dockerProbe = undefined;
}

function dockerBin(): string {
  return process.env.CLAWQL_SANDBOX_DOCKER_BIN?.trim() || "docker";
}

export function bridgeCredentialsConfigured(): boolean {
  const base = process.env.CLAWQL_SANDBOX_BRIDGE_URL?.trim();
  const token = process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN?.trim();
  return Boolean(base && token);
}

/** macOS Seatbelt: `sandbox-exec` present and executable. */
export function seatbeltBinaryPresent(): boolean {
  if (process.platform !== "darwin") return false;
  try {
    fs.accessSync("/usr/bin/sandbox-exec", fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function probeDockerCliOnce(): Promise<boolean> {
  const bin = dockerBin();
  return new Promise((resolve) => {
    const child = spawn(bin, ["version"], { stdio: "ignore" });
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 4000);
    child.on("error", () => {
      clearTimeout(t);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve(code === 0);
    });
  });
}

/** True if `docker version` / `podman version` exits 0 within a short timeout (cached per process). */
export async function dockerCliReachable(): Promise<boolean> {
  dockerProbe ??= probeDockerCliOnce();
  return dockerProbe;
}

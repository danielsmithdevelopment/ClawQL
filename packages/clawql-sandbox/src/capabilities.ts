/**
 * Probes for sandbox_exec backends: Agent Substrate, Kata RuntimeClass, Seatbelt binary,
 * Docker/Podman CLI, Cloudflare bridge credentials.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import { Effect } from "effect";
import { agentSubstrateConfigured } from "./agent-substrate/types.js";
import {
  createInClusterKataClient,
  kataRuntimeClassAvailableEffect,
  kataSandboxEnabled,
} from "./kata-kubernetes.js";

let dockerProbe: Promise<boolean> | undefined;
let kataProbe: Promise<boolean> | undefined;

/** Test-only: reset cached Docker CLI probe between Vitest cases. */
export function resetSandboxDockerProbeForTest(): void {
  dockerProbe = undefined;
}

/** Test-only: reset cached Kata probe between Vitest cases. */
export function resetSandboxKataProbeForTest(): void {
  kataProbe = undefined;
}

function dockerBin(): string {
  return process.env.CLAWQL_SANDBOX_DOCKER_BIN?.trim() || "docker";
}

export function bridgeCredentialsConfiguredEffect(): Effect.Effect<boolean> {
  return Effect.sync(() => {
    const base = process.env.CLAWQL_SANDBOX_BRIDGE_URL?.trim();
    const token = process.env.CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN?.trim();
    return Boolean(base && token);
  });
}

/** Sync façade for capability checks that still expect a boolean. */
export function bridgeCredentialsConfigured(): boolean {
  return Effect.runSync(bridgeCredentialsConfiguredEffect());
}

/** Agent Substrate configured (mock enabled or live URL+token) — ADR 0011. */
export function agentSubstrateReachableEffect(): Effect.Effect<boolean> {
  return Effect.sync(() => agentSubstrateConfigured());
}

export function agentSubstrateReachable(): boolean {
  return Effect.runSync(agentSubstrateReachableEffect());
}

/** macOS Seatbelt: `sandbox-exec` present and executable. */
export function seatbeltBinaryPresentEffect(): Effect.Effect<boolean> {
  return Effect.sync(() => {
    if (process.platform !== "darwin") return false;
    try {
      fs.accessSync("/usr/bin/sandbox-exec", fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function seatbeltBinaryPresent(): boolean {
  return Effect.runSync(seatbeltBinaryPresentEffect());
}

function probeDockerCliOnceEffect(): Effect.Effect<boolean> {
  return Effect.callback<boolean>((resume) => {
    const bin = dockerBin();
    const child = spawn(bin, ["version"], { stdio: "ignore" });
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      resume(Effect.succeed(false));
    }, 4000);
    child.on("error", () => {
      clearTimeout(t);
      resume(Effect.succeed(false));
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resume(Effect.succeed(code === 0));
    });
  });
}

/** True if `docker version` / `podman version` exits 0 within a short timeout (cached per process). */
export function dockerCliReachableEffect(): Effect.Effect<boolean> {
  return Effect.suspend(() => {
    if (!dockerProbe) {
      dockerProbe = Effect.runPromise(probeDockerCliOnceEffect());
    }
    return Effect.promise(() => dockerProbe!);
  });
}

/** Promise façade for callers that still await a boolean probe. */
export async function dockerCliReachable(): Promise<boolean> {
  return Effect.runPromise(dockerCliReachableEffect());
}

function probeKataRuntimeOnceEffect(): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    if (!kataSandboxEnabled()) return false;
    const client = createInClusterKataClient();
    if (!client) return false;
    return yield* kataRuntimeClassAvailableEffect(client);
  });
}

/** True when Kata RuntimeClass is reachable in-cluster (cached per process). */
export function kataRuntimeReachableEffect(): Effect.Effect<boolean> {
  return Effect.suspend(() => {
    if (!kataProbe) {
      kataProbe = Effect.runPromise(probeKataRuntimeOnceEffect());
    }
    return Effect.promise(() => kataProbe!);
  });
}

/** Promise façade for callers that still await a boolean probe. */
export async function kataRuntimeReachable(): Promise<boolean> {
  return Effect.runPromise(kataRuntimeReachableEffect());
}

/**
 * sandbox_exec backend: run snippets in an OCI container via **`docker`** / **`podman`** CLI.
 * Works with Docker Desktop, OrbStack, Colima, Linux Docker Engine, podman-docker shim, etc.
 */

import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  SandboxBridgeResponse,
  SandboxCodeToolInput,
  SandboxLanguage,
} from "./sandbox-types.js";
import {
  defaultPersistence,
  parseTimeoutMs,
  resolveSandboxId,
  snippetFilename,
} from "./sandbox-shared.js";

const CONTAINER_WORKSPACE = "/workspace";

function dockerBin(): string {
  return process.env.CLAWQL_SANDBOX_DOCKER_BIN?.trim() || "docker";
}

function dockerNetwork(): string {
  const v = process.env.CLAWQL_SANDBOX_DOCKER_NETWORK?.trim();
  return v !== undefined && v.length > 0 ? v : "none";
}

function imageForLanguage(language: SandboxLanguage): string {
  switch (language) {
    case "python":
      return process.env.CLAWQL_SANDBOX_DOCKER_IMAGE_PYTHON?.trim() || "python:3.12-alpine";
    case "javascript":
      return process.env.CLAWQL_SANDBOX_DOCKER_IMAGE_NODE?.trim() || "node:22-alpine";
    case "shell":
      return process.env.CLAWQL_SANDBOX_DOCKER_IMAGE_SHELL?.trim() || "alpine:3.21";
    default:
      return "alpine:3.21";
  }
}

function innerArgv(language: SandboxLanguage): string[] {
  const rel = snippetFilename(language);
  switch (language) {
    case "python":
      return ["python3", rel];
    case "javascript":
      return ["node", rel];
    case "shell":
      return ["sh", rel];
    default:
      return ["sh", rel];
  }
}

function workspaceRootFor(sandboxId: string): string {
  const base = path.join(os.tmpdir(), "clawql-docker-workspaces");
  return path.join(base, sandboxId);
}

/** Extra docker run flags from env (space-separated): e.g. `--cpus 1 --memory 512m`. */
function extraDockerArgs(): string[] {
  const raw = process.env.CLAWQL_SANDBOX_DOCKER_RUN_EXTRA?.trim();
  if (!raw) return [];
  return raw.split(/\s+/).filter(Boolean);
}

function spawnDockerRun(
  bin: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    const t = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(t);
      rejectPromise(err);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

export async function callDockerSandbox(
  input: SandboxCodeToolInput
): Promise<SandboxBridgeResponse> {
  const persistenceMode = input.persistenceMode ?? defaultPersistence();
  const sandboxId = resolveSandboxId(persistenceMode, input.sessionId);
  const workspace = workspaceRootFor(sandboxId);
  const timeoutMs = parseTimeoutMs(input.timeoutMs);
  const snippetPath = path.join(workspace, snippetFilename(input.language));
  const bin = dockerBin();
  const net = dockerNetwork();
  const image = imageForLanguage(input.language);
  const inner = innerArgv(input.language);

  const absWorkspace = path.resolve(workspace);
  const volArg = `${absWorkspace}:${CONTAINER_WORKSPACE}`;

  const runArgs = [
    "run",
    "--rm",
    "--network",
    net,
    "-v",
    volArg,
    "-w",
    CONTAINER_WORKSPACE,
    ...extraDockerArgs(),
    image,
    ...inner,
  ];

  try {
    await mkdir(workspace, { recursive: true });
    await writeFile(snippetPath, input.code, "utf8");

    const { stdout, stderr, exitCode } = await spawnDockerRun(bin, runArgs, timeoutMs);
    const ok = exitCode === 0;
    return {
      stdout,
      stderr,
      exitCode,
      success: ok,
      sandboxId,
      backend: "docker",
      ...(ok ? {} : { error: stderr.trim() || stdout.trim() || `exit ${exitCode}` }),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    let hint = msg;
    if (msg.includes("ENOENT")) {
      hint = `${bin} not found (${hint}). Install Docker / OrbStack / Podman or set CLAWQL_SANDBOX_DOCKER_BIN.`;
    }
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      backend: "docker",
      error: hint,
    };
  } finally {
    if (persistenceMode === "ephemeral") {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}

/**
 * Local macOS sandbox_exec backend using `/usr/bin/sandbox-exec` + Seatbelt profiles.
 * Host-only; independent of Cloudflare bridge / Kubernetes mesh (#207, extends #23 air-gapped sandbox).
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

/** Embedded profile — deny outbound network; filesystem tightened further in follow-ups. */
export const SEATBELT_PROFILE_V1 = `(version 1)
(allow default)
(deny network*)
`;

function workspaceRootFor(sandboxId: string): string {
  const base = path.join(os.tmpdir(), "clawql-seatbelt-workspaces");
  return path.join(base, sandboxId);
}

function execParts(language: SandboxLanguage, workspace: string): { argv: string[] } {
  const rel = snippetFilename(language);
  const fp = path.join(workspace, rel);
  switch (language) {
    case "python":
      return { argv: ["/usr/bin/python3", fp] };
    case "javascript":
      return { argv: ["node", fp] };
    case "shell":
      return { argv: ["/bin/sh", fp] };
    default:
      return { argv: ["/bin/cat", fp] };
  }
}

function spawnSeatbelt(
  profilePath: string,
  argv: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const exe = "/usr/bin/sandbox-exec";
  const args = ["-f", profilePath, "--", ...argv];
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(exe, args, {
      cwd,
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

export async function callMacosSeatbeltSandbox(
  input: SandboxCodeToolInput
): Promise<SandboxBridgeResponse> {
  if (process.platform !== "darwin") {
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      backend: "macos-seatbelt",
      error:
        "CLAWQL_SANDBOX_BACKEND=macos-seatbelt requires macOS (darwin). Use bridge or docker backend instead.",
    };
  }

  const persistenceMode = input.persistenceMode ?? defaultPersistence();
  const sandboxId = resolveSandboxId(persistenceMode, input.sessionId);
  const workspace = workspaceRootFor(sandboxId);
  const timeoutMs = parseTimeoutMs(input.timeoutMs);
  const profilePath = path.join(workspace, ".clawql-seatbelt.sb");
  const snippetPath = path.join(workspace, snippetFilename(input.language));

  try {
    await mkdir(workspace, { recursive: true });
    await writeFile(profilePath, SEATBELT_PROFILE_V1, "utf8");
    await writeFile(snippetPath, input.code, "utf8");

    const { argv } = execParts(input.language, workspace);
    const { stdout, stderr, exitCode } = await spawnSeatbelt(
      profilePath,
      argv,
      workspace,
      timeoutMs
    );

    const ok = exitCode === 0;
    return {
      stdout,
      stderr,
      exitCode,
      success: ok,
      sandboxId,
      backend: "macos-seatbelt",
      ...(ok ? {} : { error: stderr.trim() || `exit ${exitCode}` }),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      stdout: "",
      stderr: "",
      exitCode: -1,
      success: false,
      backend: "macos-seatbelt",
      error: msg.includes("ENOENT")
        ? `sandbox-exec not found at /usr/bin/sandbox-exec (${msg})`
        : msg,
    };
  } finally {
    if (persistenceMode === "ephemeral") {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}

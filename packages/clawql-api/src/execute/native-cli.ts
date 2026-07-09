/**
 * Execute user-added CLI sources via subprocess.
 */

import { spawn } from "node:child_process";
import type { Operation } from "../spec/operation-types.js";
import type { ExecuteOperationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 120_000;

function collectOutput(
  child: ReturnType<typeof spawn>,
  timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function executeNativeCli(
  op: Operation,
  args: Record<string, unknown>
): Promise<ExecuteOperationResult> {
  const meta = op.nativeCli;
  if (!meta) {
    return { ok: false, error: "Internal error: missing nativeCli metadata" };
  }

  const extraArgs = Array.isArray(args.args) ? args.args.map((a) => String(a)) : [];
  const argv = [...meta.args, ...extraArgs];
  const stdin =
    typeof args.stdin === "string"
      ? args.stdin
      : args.stdin != null
        ? JSON.stringify(args.stdin)
        : undefined;

  try {
    const child = spawn(meta.command, argv, {
      env: { ...process.env, ...meta.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (stdin !== undefined) {
      child.stdin?.write(stdin);
      child.stdin?.end();
    }
    const { code, stdout, stderr } = await collectOutput(child, DEFAULT_TIMEOUT_MS);
    if (code !== 0) {
      return {
        ok: false,
        error: stderr.trim() || stdout.trim() || `CLI exited with code ${code}`,
      };
    }
    return {
      ok: true,
      data: {
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      },
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

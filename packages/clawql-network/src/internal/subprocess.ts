import { spawn } from "node:child_process";

import { Effect } from "effect";

import { NetworkCommandError } from "../errors.js";

export type SpawnResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

export type SpawnOptions = {
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
};

export const spawnCollect = (
  command: string,
  args: readonly string[],
  options: SpawnOptions = {}
): Effect.Effect<SpawnResult, NetworkCommandError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<SpawnResult>((resolve, reject) => {
        const child = spawn(command, [...args], {
          env: { ...process.env, ...options.env },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        const timer =
          options.timeoutMs !== undefined
            ? setTimeout(() => {
                child.kill("SIGKILL");
                reject(
                  new NetworkCommandError({
                    command: [command, ...args].join(" "),
                    exitCode: null,
                    stderr,
                    message: `command timed out after ${options.timeoutMs}ms`,
                  })
                );
              }, options.timeoutMs)
            : undefined;

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        child.on("error", (err) => {
          if (timer) clearTimeout(timer);
          reject(
            new NetworkCommandError({
              command: [command, ...args].join(" "),
              exitCode: null,
              stderr: String(err),
              message: err.message,
            })
          );
        });
        child.on("close", (code) => {
          if (timer) clearTimeout(timer);
          const exitCode = code ?? 1;
          if (exitCode !== 0) {
            reject(
              new NetworkCommandError({
                command: [command, ...args].join(" "),
                exitCode,
                stderr,
                message: stderr.trim() || `exit ${exitCode}`,
              })
            );
            return;
          }
          resolve({ stdout, stderr, exitCode });
        });
      }),
    catch: (error) =>
      error instanceof NetworkCommandError
        ? error
        : new NetworkCommandError({
            command: [command, ...args].join(" "),
            exitCode: null,
            stderr: String(error),
            message: error instanceof Error ? error.message : String(error),
          }),
  });

export const commandAvailable = (command: string): Effect.Effect<boolean, never> =>
  Effect.promise(async () => {
    try {
      const which = process.platform === "win32" ? "where" : "which";
      const child = spawn(which, [command], { stdio: "ignore" });
      return await new Promise<boolean>((resolve) => {
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
      });
    } catch {
      return false;
    }
  });

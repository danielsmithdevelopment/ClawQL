import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

import { Effect } from "effect";

import { NetworkBinaryNotFoundError, NetworkCommandError } from "../errors.js";
import { resolveTailcatBinary } from "./binary.js";

export type TailcatListenerOptions = {
  readonly derpServer?: string;
  readonly allowedPublicKeys?: readonly string[];
};

export type TailcatListenerHandle = {
  readonly address: string;
  readonly localPublicKey: string;
  readonly process: ChildProcess;
  readonly stop: () => Effect.Effect<void, NetworkCommandError>;
};

export type TailcatConnection = {
  readonly localPublicKey: string;
  readonly remotePublicKey: string;
  readonly derpServer: string | null;
  readonly process: ChildProcess;
  readonly stop: () => Effect.Effect<void, NetworkCommandError>;
};

type TailcatJsonLine = {
  address?: string;
  localPublicKey?: string;
  remotePublicKey?: string;
  derpServer?: string | null;
};

const stopChild = (child: ChildProcess): Effect.Effect<void, NetworkCommandError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        if (child.killed || child.exitCode !== null) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5_000);
        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
        child.once("error", (err) => {
          clearTimeout(timer);
          reject(
            new NetworkCommandError({
              command: "tailcat",
              exitCode: null,
              stderr: String(err),
              message: err.message,
            })
          );
        });
        child.kill("SIGTERM");
      }),
    catch: (error) =>
      new NetworkCommandError({
        command: "tailcat",
        exitCode: null,
        stderr: String(error),
        message: error instanceof Error ? error.message : String(error),
      }),
  });

const parseFirstJsonLine = (stdout: string): TailcatJsonLine => {
  const line = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) throw new Error("tailcat produced no stdout");
  return JSON.parse(line) as TailcatJsonLine;
};

const spawnTailcat = (
  subcommand: "listen" | "connect",
  tailcatArgs: string[]
): Effect.Effect<
  { child: ChildProcess; stdout: string },
  NetworkCommandError | NetworkBinaryNotFoundError
> =>
  Effect.gen(function* () {
    const bin = yield* resolveTailcatBinary();
    const args = [...bin.argsPrefix, subcommand, ...tailcatArgs];
    return yield* Effect.tryPromise({
      try: () =>
        new Promise<{ child: ChildProcess; stdout: string }>((resolve, reject) => {
          const child = spawn(bin.command, args, {
            stdio: subcommand === "listen" ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
            env: process.env,
          });
          let stdout = "";
          let stderr = "";
          const tryResolveFromStdout = () => {
            try {
              const parsed = parseFirstJsonLine(stdout);
              if (
                (subcommand === "listen" && parsed.address && parsed.localPublicKey) ||
                (subcommand === "connect" && parsed.localPublicKey && parsed.remotePublicKey)
              ) {
                clearTimeout(timer);
                resolve({ child, stdout });
              }
            } catch {
              // wait for more stdout
            }
          };

          const timer = setTimeout(() => {
            child.kill("SIGTERM");
            reject(
              new NetworkCommandError({
                command: [bin.command, ...args].join(" "),
                exitCode: null,
                stderr,
                message: `tailcat ${subcommand} timed out waiting for JSON handshake`,
              })
            );
          }, 15_000);

          child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString("utf8");
            tryResolveFromStdout();
          });
          child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf8");
          });
          child.on("error", (err) => {
            clearTimeout(timer);
            reject(
              new NetworkCommandError({
                command: [bin.command, ...args].join(" "),
                exitCode: null,
                stderr,
                message: err.message,
              })
            );
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0 && code !== null) {
              reject(
                new NetworkCommandError({
                  command: [bin.command, ...args].join(" "),
                  exitCode: code,
                  stderr,
                  message: stderr.trim() || `tailcat ${subcommand} exited ${code}`,
                })
              );
            }
          });
        }),
      catch: (error) =>
        error instanceof NetworkCommandError
          ? error
          : new NetworkCommandError({
              command: `tailcat ${subcommand}`,
              exitCode: null,
              stderr: String(error),
              message: error instanceof Error ? error.message : String(error),
            }),
    });
  });

/** Spawn tailcat listener subprocess (spec §5.1). */
export const startTailcatListener = (
  opts: TailcatListenerOptions = {}
): Effect.Effect<TailcatListenerHandle, NetworkCommandError | NetworkBinaryNotFoundError> =>
  Effect.gen(function* () {
    const args: string[] = [];
    if (opts.derpServer) {
      args.push("--derp-server", opts.derpServer);
    }
    for (const pk of opts.allowedPublicKeys ?? []) {
      args.push("--allow-pk", pk);
    }
    const { child, stdout } = yield* spawnTailcat("listen", args);
    const parsed = parseFirstJsonLine(stdout);
    if (!parsed.address || !parsed.localPublicKey) {
      yield* stopChild(child);
      return yield* Effect.fail(
        new NetworkCommandError({
          command: "tailcat listen",
          exitCode: null,
          stderr: stdout,
          message: "tailcat listen did not return address/localPublicKey JSON",
        })
      );
    }
    return {
      address: parsed.address,
      localPublicKey: parsed.localPublicKey,
      process: child,
      stop: () => stopChild(child),
    };
  });

/** Connect to a tailcat address via subprocess client mode (spec §5.1). */
export const connectViaTailcat = (
  address: string
): Effect.Effect<TailcatConnection, NetworkCommandError | NetworkBinaryNotFoundError> =>
  Effect.gen(function* () {
    const { child, stdout } = yield* spawnTailcat("connect", [address]);
    const parsed = parseFirstJsonLine(stdout);
    if (!parsed.localPublicKey || !parsed.remotePublicKey) {
      yield* stopChild(child);
      return yield* Effect.fail(
        new NetworkCommandError({
          command: "tailcat connect",
          exitCode: null,
          stderr: stdout,
          message: "tailcat connect did not return key material JSON",
        })
      );
    }
    return {
      localPublicKey: parsed.localPublicKey,
      remotePublicKey: parsed.remotePublicKey,
      derpServer: parsed.derpServer ?? null,
      process: child,
      stop: () => stopChild(child),
    };
  });

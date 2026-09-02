import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

import { Effect } from "effect";

import { NetworkCommandError } from "../../errors.js";
import { commandAvailable } from "../../internal/subprocess.js";

export type DerperHandle = {
  readonly region: string;
  readonly endpoint: string;
  readonly process: ChildProcess;
  readonly stop: () => Effect.Effect<void, NetworkCommandError>;
};

const stopChild = (child: ChildProcess): Effect.Effect<void, NetworkCommandError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        if (child.killed || child.exitCode !== null) {
          resolve();
          return;
        }
        const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
        child.once("error", (err) => {
          clearTimeout(timer);
          reject(
            new NetworkCommandError({
              command: "derper",
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
        command: "derper",
        exitCode: null,
        stderr: String(error),
        message: error instanceof Error ? error.message : String(error),
      }),
  });

/** Optional self-hosted DERP relay (spec §5.2). */
export const startSelfHostedDerper = (
  region: string
): Effect.Effect<DerperHandle, NetworkCommandError> =>
  Effect.gen(function* () {
    const derperCli = yield* commandAvailable("derper");
    if (derperCli) {
      const child = spawn("derper", ["-hostname", `derp-${region}.clawql.local`], {
        detached: false,
        stdio: "ignore",
      });
      return {
        region,
        endpoint: `derp-${region}.clawql.local`,
        process: child,
        stop: () => stopChild(child),
      };
    }

    const dockerCli = yield* commandAvailable("docker");
    if (dockerCli) {
      const child = spawn(
        "docker",
        ["run", "--rm", "--name", `clawql-derper-${region}`, "-p", "443:443", "tailscale/derper"],
        { detached: false, stdio: "ignore" }
      );
      return {
        region,
        endpoint: `localhost:443`,
        process: child,
        stop: () => stopChild(child),
      };
    }

    return yield* Effect.fail(
      new NetworkCommandError({
        command: "derper",
        exitCode: null,
        stderr: "",
        message:
          "No derper binary or docker available — install cmd/derper or Docker to run a self-hosted DERP relay",
      })
    );
  });
